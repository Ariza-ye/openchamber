/**
 * An OpenCode 2.x `/api/*` surface served from pi.
 *
 * The shared UI talks to one backend contract and knows nothing else. The proxy
 * forwards `/api/*` to whatever `buildOpenCodeUrl` resolves, so running on pi
 * means putting an HTTP server in front of pi that answers OpenCode's routes.
 * This module is that server.
 *
 * Response envelopes differ per route and getting one wrong fails silently, so
 * each route below states its shape:
 *
 * - `/api/config` — a bare array of documents;
 * - `/api/model`, `/api/provider`, `/api/agent`, `/api/command`, `/api/skill`,
 *   `/api/mcp`, `/api/vcs`, `/api/shell`, `/api/form`,
 *   `/api/permission/request` — `{ location, data }`;
 * - `/api/session` — `{ data, cursor }`; `/api/session/:id` — the record;
 * - `/api/session/:id/message` — `{ data, cursor }`.
 *
 * Request bodies are decoded with the schemas in `./wire.js`; an unreadable
 * body is a 400 rather than a silently empty prompt.
 *
 * Routes pi cannot answer are answered honestly with empty, well-formed data:
 * pi has one agent, no permission prompts, no forms and no inbox.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { readPiCommands, readPiSkills } from './config.js';
import { createPiEventTranslator } from './event-translator.js';
import { generatePiText } from './generate.js';
import { piSessionDirFor, resolvePiAgentDir } from './paths.js';
import { PI_AGENT_ID, projectIdForDirectory, projectSessionFile, projectSessionFileMessages } from './projection.js';
import { findPiSessionFile, listSessionFilesNewestFirst, readSession, statOf } from './session-store.js';
import { modelVariantIds } from './thinking.js';
import {
  parseJsonWith,
  piAuthFileSchema,
  piMcpFileSchema,
  piModelsFileSchema,
  piModelsStoreSchema,
  piSettingsSchema,
} from './schemas.js';

const OPENCODE_COMPAT_VERSION = '2.0.20';
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
const SSE_HEARTBEAT_MS = 15_000;
const MODEL_CATALOG_TTL_MS = 60_000;

const jsonError = (res, status, message) => res.status(status).json({ error: message });

const zeroTokens = () => ({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } });

const catalog = (directory, data) => ({ location: { directory }, data });

const readJsonFile = async (filePath, schema, fallback) => {
  try {
    return parseJsonWith(schema, await fs.readFile(filePath, 'utf8')) ?? fallback;
  } catch {
    return fallback;
  }
};

const readGitBranch = async (directory) => {
  try {
    const head = (await fs.readFile(path.join(directory, '.git', 'HEAD'), 'utf8')).trim();
    const match = /^ref:\s*refs\/heads\/(.+)$/m.exec(head);
    return match ? match[1].trim() : undefined;
  } catch {
    return undefined;
  }
};

/** A percent-escape in the directory header: the SDK URI-encodes it and sends no marker. */
const PERCENT_ESCAPE = /%[0-9a-fA-F]{2}/;

/** The directory a request is scoped to: header first, then query, then `fallback`. */
const requestDirectory = (req, fallback = process.cwd()) => {
  const header = req.get?.('x-opencode-directory');
  if (header?.trim()) {
    const raw = header.trim();
    // Read the header the way OpenCode does, so an encoded path reaches `fs`
    // and `cwd` as the directory it names (`spaces/dispatcher.js` has the rule).
    if (req.get?.('x-opencode-directory-encoding') === 'uri' || PERCENT_ESCAPE.test(raw)) {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }
  const query = [req.query?.directory].flat().find((value) => Boolean(value));
  if (query) return query;
  return fallback;
};

/**
 * pi's configured endpoints → OpenCode `ProviderInfo`.
 *
 * The cached catalog also names built-in providers with no entry in
 * `models.json`, and the UI lists those too.
 */
const projectProviders = (configured, cached) => {
  const seen = new Set();
  const providers = [];
  for (const [providerID, endpoint] of Object.entries(configured)) {
    seen.add(providerID);
    providers.push({
      id: providerID,
      name: providerID,
      activation: 'enabled',
      package: endpoint.api ?? 'pi-endpoint',
    });
  }
  for (const [providerID, entry] of Object.entries(cached)) {
    if (seen.has(providerID)) continue;
    if ((entry.models ?? []).length === 0) continue;
    providers.push({ id: providerID, name: providerID, activation: 'enabled', package: 'pi' });
  }
  return providers;
};

const modelInfo = ({ providerID, id, name, api, input, cost, contextWindow, maxTokens, reasoning, thinkingLevelMap }) => ({
  id,
  modelID: id,
  providerID,
  name: name ?? id,
  family: providerID,
  ...(api ? { package: api } : undefined),
  capabilities: { tools: true, input: input ?? ['text'], output: ['text'] },
  variants: modelVariantIds({ reasoning, thinkingLevelMap }).map((level) => ({ id: level })),
  time: { released: 0 },
  cost: [{
    input: cost?.input ?? 0,
    output: cost?.output ?? 0,
    cache: { read: cost?.cacheRead ?? 0, write: cost?.cacheWrite ?? 0 },
  }],
  status: 'active',
  enabled: true,
  limit: { context: contextWindow ?? 200_000, output: maxTokens ?? 8_192 },
});

/** The configured endpoints' models, enriched from pi's cached catalog. */
const projectModels = (configured, cached) => {
  const models = [];
  for (const [providerID, endpoint] of Object.entries(configured)) {
    const cachedModels = cached[providerID]?.models ?? [];
    for (const model of endpoint.models ?? []) {
      const resolved = cachedModels.find((candidate) => candidate.id === model.id) ?? {};
      models.push(modelInfo({
        providerID,
        id: model.id,
        name: resolved.name ?? model.name,
        api: model.api,
        input: resolved.input ?? model.input,
        cost: resolved.cost ?? model.cost,
        contextWindow: resolved.contextWindow ?? model.contextWindow,
        maxTokens: resolved.maxTokens ?? model.maxTokens,
        reasoning: resolved.reasoning ?? model.reasoning,
        thinkingLevelMap: resolved.thinkingLevelMap ?? model.thinkingLevelMap,
      }));
    }
  }
  // A built-in provider's models live only in the cache.
  for (const [providerID, entry] of Object.entries(cached)) {
    if (Object.prototype.hasOwnProperty.call(configured, providerID)) continue;
    for (const model of entry.models ?? []) {
      models.push(modelInfo({ providerID, ...model }));
    }
  }
  return models;
};

/**
 * pi's `auth.json` → OpenCode credentials.
 *
 * This is how Pichamber's quota, voice and routing read provider keys, so the
 * shape has to match `GET /api/credential` exactly.
 */
const projectCredentials = (auth) => {
  const credentials = [];
  for (const [integrationID, entry] of Object.entries(auth)) {
    const id = `cred_${crypto.createHash('sha1').update(integrationID).digest('hex').slice(0, 16)}`;
    if (entry.type === 'api_key') {
      credentials.push({
        id,
        integrationID,
        type: 'key',
        key: entry.key ?? '',
        active: true,
        time: { created: 0, updated: 0 },
      });
      continue;
    }
    if (entry.type === 'oauth') {
      const oauth = {
        id,
        integrationID,
        type: 'oauth',
        access: entry.access ?? '',
        refresh: entry.refresh ?? '',
        expires: entry.expires ?? 0,
        active: true,
        time: { created: 0, updated: 0 },
      };
      if (entry.accountId) oauth.metadata = { accountID: entry.accountId };
      credentials.push(oauth);
    }
  }
  return credentials;
};

/**
 * Writes a new session file's header.
 *
 * pi opens an existing file with a valid header as the session, so creating it
 * here gives the adapter the id and path up front instead of starting a child
 * just to learn them.
 */
const createSessionFile = async ({ agentDir, directory, sessionID }) => {
  const sessionDir = piSessionDirFor(agentDir, directory);
  if (!sessionDir) throw new Error('A session needs a working directory');
  await fs.mkdir(sessionDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(sessionDir, `${stamp}_${sessionID}.jsonl`);
  const header = { type: 'session', version: 3, id: sessionID, timestamp: new Date().toISOString(), cwd: directory };
  await fs.writeFile(filePath, `${JSON.stringify(header)}\n`, 'utf8');
  return filePath;
};

/**
 * The adapter's Express app.
 *
 * `runtime` owns the pi processes; `binary` and `env` are what the model
 * catalog probe runs with.
 */
export const createPiApiApp = ({
  express,
  runtime,
  agentDir: agentDirOption,
  binary = 'pi',
  env = process.env,
  log = console,
}) => {
  const app = express();
  app.disable('x-powered-by');
  // Prompt bodies carry images inline, so the limit matches the proxy's.
  app.use(express.json({ limit: '50mb' }));

  const agentDir = agentDirOption ?? resolvePiAgentDir();

  /** sessionID -> the directory it runs in (the UI asks by id from anywhere). */
  const sessionDirectories = new Map();
  /** sessionID -> translator feeding the event stream. */
  const translators = new Map();
  /**
   * sessionID -> the client message ids that produced the session's user turns.
   *
   * The UI mints the id of the message it just sent and keeps that message in
   * its store. pi assigns no id of its own, so a history read would invent a
   * timestamp id and the transcript would show the prompt twice. Matching the
   * next user message by text keeps both reads on the same id.
   */
  const clientMessageIds = new Map();
  /** SSE listeners; the server's event hub holds one. */
  const wireListeners = new Set();

  const broadcast = (event) => {
    for (const listener of Array.from(wireListeners)) {
      try {
        listener(event);
      } catch {
        wireListeners.delete(listener);
      }
    }
  };

  runtime.subscribe(({ sessionID, record }) => {
    translators.get(sessionID)?.push(record);
  });

  const translatorFor = (sessionID, directory) => {
    let translator = translators.get(sessionID);
    if (!translator) {
      translator = createPiEventTranslator({ sessionID, directory, emit: broadcast });
      translators.set(sessionID, translator);
    }
    return translator;
  };

  const fileFor = async (sessionID, directory) => findPiSessionFile({ agentDir, sessionID, directory });

  const sessionInfoFor = async (filePath, directoryHint = null) => {
    const stat = await statOf(filePath);
    if (!stat) return null;
    const { header, lines } = await readSession(filePath);
    return projectSessionFile({ filePath, header, lines, updatedAt: stat.mtimeMs, directoryHint });
  };

  const sessionMessagesFor = async (filePath, sessionID = null) => {
    const { lines } = await readSession(filePath);
    const messages = projectSessionFileMessages(lines);
    const recorded = sessionID ? clientMessageIds.get(sessionID) : null;
    if (!recorded || recorded.length === 0) return messages;

    // Each read starts from the top: an id a previous read used still belongs
    // to the same message on the next read.
    const remaining = recorded.slice();
    for (const message of messages) {
      if (message.type !== 'user') continue;
      const index = remaining.findIndex((entry) => entry.text === message.text);
      if (index < 0) continue;
      message.id = remaining.splice(index, 1)[0].id;
    }
    return messages;
  };

  /**
   * The process for one session, pointed at that session's file.
   *
   * A pi process holds one session, so the runtime keys processes by session
   * id; a new session gets its file written first.
   */
  const openSession = async ({ sessionID, directory }) => {
    const existing = await fileFor(sessionID, directory);
    const sessionFile = existing ?? await createSessionFile({ agentDir, directory, sessionID });
    sessionDirectories.set(sessionID, directory);
    return runtime.ensure({ sessionID, directory, sessionFile });
  };

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  app.get('/api/info', (_req, res) => {
    res.json({ version: OPENCODE_COMPAT_VERSION, pid: process.pid, urls: [], paths: { tmp: os.tmpdir() } });
  });

  // ---------------------------------------------------------------------------
  // Location and catalogs
  // ---------------------------------------------------------------------------

  app.get('/api/location', (req, res) => {
    const directory = requestDirectory(req);
    res.json({ directory, project: { id: projectIdForDirectory(directory), directory, canonical: directory } });
  });

  app.delete('/api/debug/location', (_req, res) => res.status(204).end());

  app.get('/api/agent', (req, res) => {
    res.json(catalog(requestDirectory(req), [{
      id: PI_AGENT_ID,
      name: 'Pi',
      description: 'The pi coding agent',
      mode: 'primary',
      hidden: false,
      permissions: [],
      request: { settings: {}, headers: {}, body: {} },
    }]));
  });

  app.get('/api/agent/:agentID', (req, res) => {
    if (req.params.agentID !== PI_AGENT_ID) return jsonError(res, 404, 'Agent not found');
    res.json(catalog(requestDirectory(req), {
      id: PI_AGENT_ID,
      name: 'Pi',
      mode: 'primary',
      hidden: false,
      permissions: [],
      request: { settings: {}, headers: {}, body: {} },
    }));
  });

  app.get('/api/command', async (req, res) => {
    res.json(catalog(requestDirectory(req), await readPiCommands(agentDir)));
  });

  app.get('/api/skill', async (req, res) => {
    res.json(catalog(requestDirectory(req), await readPiSkills(agentDir)));
  });

  app.get('/api/mcp', async (req, res) => {
    const document = await readJsonFile(path.join(agentDir, 'mcp.json'), piMcpFileSchema, {});
    const servers = document.mcpServers ?? {};
    res.json(catalog(requestDirectory(req), Object.entries(servers).map(([name, entry]) => ({
      name,
      status: entry.enabled === false ? { status: 'disabled' } : { status: 'connected' },
    }))));
  });

  app.get('/api/mcp/resource', (_req, res) => res.json({ resources: [], templates: [] }));

  // pi has no web-search provider of its own: its tools do the fetching.
  app.get('/api/websearch/provider', (req, res) => res.json(catalog(requestDirectory(req), [])));

  app.get('/api/plugin', (req, res) => res.json(catalog(requestDirectory(req), [])));

  /**
   * The effective config, as one document.
   *
   * The UI merges whatever documents arrive. pi has a single user-level
   * `settings.json`, so one document carries the facts the pages read: the
   * default agent and the default model.
   */
  app.get('/api/config', async (_req, res) => {
    const settings = await readJsonFile(path.join(agentDir, 'settings.json'), piSettingsSchema, {});
    const info = {
      default_agent: PI_AGENT_ID,
      agents: { [PI_AGENT_ID]: { description: 'The pi coding agent', mode: 'primary' } },
    };
    if (settings.defaultProvider && settings.defaultModel) {
      info.model = { providerID: settings.defaultProvider, model: settings.defaultModel };
    }
    res.json([{ type: 'document', path: path.join(agentDir, 'settings.json'), info }]);
  });

  app.get('/api/vcs', async (req, res) => {
    const directory = requestDirectory(req);
    // `branch` is required by the wire shape even outside a repository; the
    // UI reads `branch.current` without checking it exists.
    const branch = await readGitBranch(directory) ?? '';
    res.json(catalog(directory, { branch: { current: branch, default: branch } }));
  });

  app.get('/api/shell', (req, res) => res.json(catalog(requestDirectory(req), [])));
  app.get('/api/form', (req, res) => res.json(catalog(requestDirectory(req), [])));
  app.get('/api/permission/request', (req, res) => res.json(catalog(requestDirectory(req), [])));

  // ---------------------------------------------------------------------------
  // Models, providers, credentials
  // ---------------------------------------------------------------------------

  /**
   * pi's model catalog, as the UI reads it.
   *
   * The built-in catalog lives in the CLI, so `pi --list-models` is the only
   * authoritative source for a provider the user never configured. It is
   * cached: the composer asks for this list on every open.
   */
  let cliCatalog = null;
  let cliCatalogAt = 0;

  const readBuiltinModels = async () => {
    const stdout = await promisify(execFile)(binary, ['--list-models'], {
      env,
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    }).then((result) => result.stdout).catch(() => '');
    const rows = [];
    for (const line of stdout.split('\n').slice(1)) {
      const columns = line.trim().split(/\s{2,}/);
      const [providerID, modelID] = columns;
      if (!providerID || !modelID || providerID === 'provider') continue;
      rows.push({ providerID, id: modelID, name: modelID });
    }
    return rows;
  };

  const readModels = async () => {
    const [configured, cached] = await Promise.all([
      readJsonFile(path.join(agentDir, 'models.json'), piModelsFileSchema, {}),
      readJsonFile(path.join(agentDir, 'models-store.json'), piModelsStoreSchema, {}),
    ]);
    const endpoints = configured.providers ?? {};
    if (!cliCatalog || Date.now() - cliCatalogAt > MODEL_CATALOG_TTL_MS) {
      cliCatalog = await readBuiltinModels();
      cliCatalogAt = Date.now();
    }
    const models = projectModels(endpoints, cached);
    const known = new Set(models.map((model) => `${model.providerID}\u0000${model.id}`));
    for (const row of cliCatalog) {
      if (known.has(`${row.providerID}\u0000${row.id}`)) continue;
      const stored = (cached[row.providerID]?.models ?? []).find((entry) => entry.id === row.id);
      models.push(modelInfo({
        providerID: row.providerID,
        id: row.id,
        name: stored?.name ?? row.name,
        input: stored?.input,
        cost: stored?.cost,
        contextWindow: stored?.contextWindow,
        maxTokens: stored?.maxTokens,
        reasoning: stored?.reasoning,
        thinkingLevelMap: stored?.thinkingLevelMap,
      }));
    }
    return { configured: endpoints, cached, models };
  };

  app.get('/api/model', async (req, res) => {
    const { models } = await readModels();
    res.json(catalog(requestDirectory(req), models));
  });

  app.get('/api/model/default', async (req, res) => {
    const [{ models }, settings] = await Promise.all([
      readModels(),
      readJsonFile(path.join(agentDir, 'settings.json'), piSettingsSchema, {}),
    ]);
    const chosen = models.find((model) => (
      model.providerID === settings.defaultProvider && model.id === settings.defaultModel
    )) ?? models[0] ?? null;
    res.json(catalog(requestDirectory(req), chosen));
  });

  app.get('/api/provider', async (req, res) => {
    const { configured, cached } = await readModels();
    res.json(catalog(requestDirectory(req), projectProviders(configured, cached)));
  });

  app.get('/api/provider/:providerID', async (req, res) => {
    const { configured, cached } = await readModels();
    const provider = projectProviders(configured, cached).find((entry) => entry.id === req.params.providerID);
    if (!provider) return jsonError(res, 404, 'Provider not found');
    res.json(catalog(requestDirectory(req), provider));
  });

  app.get('/api/integration', async (req, res) => {
    const [{ configured, cached }, auth] = await Promise.all([
      readModels(),
      readJsonFile(path.join(agentDir, 'auth.json'), piAuthFileSchema, {}),
    ]);
    const credentials = projectCredentials(auth);
    res.json(catalog(requestDirectory(req), projectProviders(configured, cached).map((provider) => ({
      id: provider.id,
      name: provider.name,
      methods: [],
      connections: credentials
        .filter((credential) => credential.integrationID === provider.id)
        .map((credential) => ({ type: 'credential', credentialID: credential.id })),
    }))));
  });

  app.get('/api/credential', async (_req, res) => {
    res.json({ data: projectCredentials(await readJsonFile(path.join(agentDir, 'auth.json'), piAuthFileSchema, {})) });
  });

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  /**
   * One answer from one model, for Pichamber's small-model routes.
   *
   * The prompt already carries the instructions, so this is a single `pi
   * --print` run with no session and no tools. The failure body names pi's own
   * reason, which `small-model` shows instead of its generic advice.
   */
  app.post('/api/experimental/generate', async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
    const providerID = String(req.body?.model?.providerID ?? '');
    const modelID = String(req.body?.model?.id ?? '');
    if (!prompt.trim()) return jsonError(res, 400, 'A prompt is required');
    if (!providerID || !modelID) return jsonError(res, 400, 'A model is required');
    try {
      const text = await generatePiText({
        binary,
        env,
        providerID,
        modelID,
        prompt,
        directory: requestDirectory(req),
      });
      res.json({ data: { text } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`[pi] generate failed: ${message}`);
      res.status(503).json({ message, code: 'small-model-unavailable', statusCode: 503 });
    }
  });

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  app.get('/api/project', async (_req, res) => {
    const files = await listSessionFilesNewestFirst({ agentDir, limit: 200 });
    const infos = await Promise.all(files.map((file) => sessionInfoFor(file.filePath)));
    const directories = Array.from(new Set(infos.filter((info) => info !== null).map((info) => info.location.directory)));
    res.json(directories.map((directory) => ({
      id: projectIdForDirectory(directory),
      canonical: directory,
      time: { created: 0, updated: 0, active: 0 },
      sandboxes: [],
    })));
  });

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  app.get('/api/session', async (req, res) => {
    const headerDirectory = req.get('x-opencode-directory');
    const queryDirectory = [req.query?.directory].flat().find((value) => Boolean(value)) ?? '';
    const scoped = queryDirectory || (headerDirectory ? requestDirectory(req, '') : '');
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query?.limit) || DEFAULT_PAGE_SIZE));
    const offset = Math.max(0, Number(req.query?.cursor) || 0);
    const files = await listSessionFilesNewestFirst({ agentDir, directory: scoped || undefined });
    const sessions = (await Promise.all(files.map((file) => sessionInfoFor(file.filePath, scoped || null))))
      .filter((session) => session !== null);
    for (const session of sessions) sessionDirectories.set(session.id, session.location.directory);
    const page = sessions.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    // `cursor` is an object, not a scalar: the client reads `cursor.previous`
    // and `cursor.next` directly.
    res.json({
      data: page,
      cursor: nextOffset < sessions.length ? { next: String(nextOffset) } : {},
    });
  });

  app.post('/api/session', async (req, res) => {
    const body = req.body ?? {};
    const directory = body.location?.directory ?? requestDirectory(req);
    const sessionID = body.id ?? `ses_${crypto.randomUUID()}`;
    try {
      const filePath = await createSessionFile({ agentDir, directory, sessionID });
      sessionDirectories.set(sessionID, directory);
      const info = await sessionInfoFor(filePath, directory);
      res.json({ data: info ?? {
        id: sessionID,
        projectID: projectIdForDirectory(directory),
        location: { directory },
        title: body.title ?? '',
        cost: 0,
        tokens: zeroTokens(),
        time: { created: Date.now(), updated: Date.now() },
      } });
    } catch (error) {
      log.error(`[pi] could not create a session: ${error instanceof Error ? error.message : String(error)}`);
      jsonError(res, 500, 'Could not create the session');
    }
  });

  app.get('/api/session/active', (_req, res) => {
    const active = {};
    for (const sessionID of runtime.busySessionIDs()) active[sessionID] = { type: 'running' };
    // The SDK reads `.data` from this route, unlike the list routes.
    res.json({ data: active });
  });

  app.get('/api/session/:sessionID', async (req, res) => {
    const { sessionID } = req.params;
    const directory = sessionDirectories.get(sessionID) ?? requestDirectory(req);
    const filePath = await fileFor(sessionID, directory);
    if (!filePath) return jsonError(res, 404, 'Session not found');
    const info = await sessionInfoFor(filePath, directory);
    if (!info) return jsonError(res, 404, 'Session not found');
    sessionDirectories.set(sessionID, info.location.directory);
    res.json({ data: info });
  });

  app.delete('/api/session/:sessionID', async (req, res) => {
    const { sessionID } = req.params;
    const filePath = await fileFor(sessionID, sessionDirectories.get(sessionID) ?? requestDirectory(req));
    await runtime.closeSession(sessionID);
    if (filePath) await fs.rm(filePath, { force: true }).catch(() => {});
    sessionDirectories.delete(sessionID);
    translators.delete(sessionID);
    clientMessageIds.delete(sessionID);
    res.status(204).end();
  });

  app.patch('/api/session/:sessionID', async (req, res) => {
    const { sessionID } = req.params;
    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(204).end();
    const directory = sessionDirectories.get(sessionID) ?? requestDirectory(req);
    const filePath = await fileFor(sessionID, directory);
    if (!filePath) return jsonError(res, 404, 'Session not found');
    const entry = runtime.ensure({ sessionID, directory, sessionFile: filePath });
    await entry.process?.request({ type: 'set_session_name', name: title }).catch(() => {});
    res.status(204).end();
  });

  app.post('/api/session/:sessionID/model', async (req, res) => {
    const { sessionID } = req.params;
    const directory = sessionDirectories.get(sessionID) ?? requestDirectory(req);
    const filePath = await fileFor(sessionID, directory);
    if (!filePath) return jsonError(res, 404, 'Session not found');
    const providerID = String(req.body?.model?.providerID ?? '');
    const modelID = String(req.body?.model?.id ?? '');
    const variant = typeof req.body?.model?.variant === 'string' ? req.body.model.variant.trim() : '';
    if (!providerID || !modelID) return jsonError(res, 400, 'A model is required');
    const entry = runtime.ensure({ sessionID, directory, sessionFile: filePath });
    try {
      await entry.process?.request({ type: 'set_model', provider: providerID, modelId: modelID });
      // pi picks a level for the new model on its own; a named variant is the
      // user's choice and has to outrank that.
      if (variant) await entry.process?.request({ type: 'set_thinking_level', level: variant });
      res.status(204).end();
    } catch (error) {
      jsonError(res, 503, error instanceof Error ? error.message : 'Could not switch the model');
    }
  });

  // pi has one agent; a switch is accepted and has no effect.
  app.post('/api/session/:sessionID/agent', (_req, res) => res.status(204).end());

  app.post('/api/session/:sessionID/generate', async (req, res) => {
    const { sessionID } = req.params;
    const prompt = req.body?.prompt;
    if (typeof prompt !== 'string' || !prompt.trim()) return jsonError(res, 400, 'A prompt is required');
    const directory = sessionDirectories.get(sessionID) ?? requestDirectory(req);
    const filePath = await fileFor(sessionID, directory);
    if (!filePath) return jsonError(res, 404, 'Session not found');
    let temporaryDirectory;
    try {
      const { header } = await readSession(filePath);
      if (!header?.cwd) throw new Error('Session directory is unavailable');
      temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'pichamber-generate-'));
      const sessionFile = path.join(temporaryDirectory, 'session.jsonl');
      await fs.copyFile(filePath, sessionFile);
      const text = await generatePiText({ binary, env, sessionFile, prompt, directory: header.cwd });
      res.json({ data: { text } });
    } catch (error) {
      log.error('[pi] session generation failed:', error instanceof Error ? error.message : String(error));
      res.status(503).json({ message: 'Could not generate text from the session' });
    } finally {
      if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  app.post('/api/session/:sessionID/prompt', async (req, res) => {
    const { sessionID } = req.params;
    const directory = sessionDirectories.get(sessionID) ?? requestDirectory(req);
    const text = String(req.body?.text ?? '');
    const messageID = req.body?.id ?? `msg_${crypto.randomUUID()}`;
    try {
      const entry = await openSession({ sessionID, directory });
      translatorFor(sessionID, directory);
      const command = { type: 'prompt', message: text };
      const images = (req.body?.files ?? [])
        .map((file) => {
          const match = /^data:([^;]+);base64,(.+)$/.exec(file.uri);
          return match ? { type: 'image', mimeType: match[1], data: match[2] } : null;
        })
        .filter((image) => image !== null);
      if (images.length > 0) command.images = images;
      if (entry.busy) command.streamingBehavior = req.body?.delivery === 'queue' ? 'followUp' : 'steer';
      await entry.process.request(command);
      const recorded = clientMessageIds.get(sessionID) ?? [];
      recorded.push({ id: messageID, text });
      if (recorded.length > 200) recorded.splice(0, recorded.length - 200);
      clientMessageIds.set(sessionID, recorded);
      res.json({
        data: {
          id: messageID,
          sessionID,
          time: { created: Date.now() },
          type: 'user',
          payload: { text },
          delivery: 'steer',
        },
      });
    } catch (error) {
      log.error(`[pi] prompt failed: ${error instanceof Error ? error.message : String(error)}`);
      jsonError(res, 500, error instanceof Error ? error.message : 'Could not send the prompt');
    }
  });

  app.post('/api/session/:sessionID/synthetic', (req, res) => {
    const { sessionID } = req.params;
    const id = req.body?.id ?? `msg_${crypto.randomUUID()}`;
    res.json({
      data: {
        id,
        sessionID,
        time: { created: Date.now() },
        type: 'synthetic',
        payload: { text: String(req.body?.text ?? ''), description: req.body?.description },
        delivery: 'steer',
      },
    });
  });

  app.post('/api/session/:sessionID/interrupt', async (req, res) => {
    const { sessionID } = req.params;
    const directory = sessionDirectories.get(sessionID) ?? requestDirectory(req);
    const filePath = await fileFor(sessionID, directory);
    if (!filePath) return res.json({ interrupted: false });
    const entry = runtime.ensure({ sessionID, directory, sessionFile: filePath });
    await entry.process?.request({ type: 'abort' }).catch(() => {});
    res.json({ interrupted: true });
  });

  app.post('/api/session/:sessionID/command', async (req, res) => {
    const { sessionID } = req.params;
    const directory = sessionDirectories.get(sessionID) ?? requestDirectory(req);
    const name = String(req.body?.name ?? '');
    if (!name) return jsonError(res, 400, 'A command needs a name');
    const args = req.body?.arguments ? ` ${req.body.arguments}` : '';
    try {
      const entry = await openSession({ sessionID, directory });
      translatorFor(sessionID, directory);
      await entry.process.request({ type: 'prompt', message: `/${name}${args}` });
      res.status(204).end();
    } catch (error) {
      jsonError(res, 500, error instanceof Error ? error.message : 'Could not run the command');
    }
  });

  app.post('/api/session/:sessionID/shell', async (req, res) => {
    const { sessionID } = req.params;
    const directory = sessionDirectories.get(sessionID) ?? requestDirectory(req);
    const filePath = await fileFor(sessionID, directory);
    if (!filePath) return jsonError(res, 404, 'Session not found');
    const entry = runtime.ensure({ sessionID, directory, sessionFile: filePath });
    void entry.process?.request({ type: 'bash', command: String(req.body?.command ?? '') }).catch(() => {});
    res.status(204).end();
  });

  app.post('/api/session/:sessionID/compact', async (req, res) => {
    const { sessionID } = req.params;
    const directory = sessionDirectories.get(sessionID) ?? requestDirectory(req);
    const filePath = await fileFor(sessionID, directory);
    if (filePath) {
      const entry = runtime.ensure({ sessionID, directory, sessionFile: filePath });
      void entry.process?.request({ type: 'compact' }).catch(() => {});
    }
    res.json({
      data: {
        id: `msg_${crypto.randomUUID()}`,
        sessionID,
        time: { created: Date.now() },
        type: 'compaction',
        payload: {},
        delivery: 'steer',
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  app.get('/api/session/:sessionID/message', async (req, res) => {
    const { sessionID } = req.params;
    const filePath = await fileFor(sessionID, sessionDirectories.get(sessionID) ?? requestDirectory(req));
    if (!filePath) return jsonError(res, 404, 'Session not found');
    const messages = await sessionMessagesFor(filePath, sessionID);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query?.limit) || DEFAULT_PAGE_SIZE));
    // The UI reads the newest page first and walks backwards with `cursor`.
    // Cursors count from the end, so a session that grows during the walk keeps
    // its older pages stable.
    const offset = Math.max(0, Number(req.query?.cursor) || 0);
    const end = Math.max(0, messages.length - offset);
    const start = Math.max(0, end - limit);
    const nextOffset = offset + (end - start);
    res.json({
      data: messages.slice(start, end),
      cursor: {
        previous: start > 0 ? String(nextOffset) : null,
        next: start > 0 ? String(nextOffset) : null,
      },
    });
  });

  app.get('/api/session/:sessionID/message/:messageID', async (req, res) => {
    const { sessionID } = req.params;
    const filePath = await fileFor(sessionID, sessionDirectories.get(sessionID) ?? requestDirectory(req));
    if (!filePath) return jsonError(res, 404, 'Session not found');
    const messages = await sessionMessagesFor(filePath, sessionID);
    const message = messages.find((entry) => entry.id === req.params.messageID);
    if (!message) return jsonError(res, 404, 'Message not found');
    res.json({ data: message });
  });

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  /**
   * The event stream.
   *
   * OpenCode sends SSE with the payload on the `data:` line and no `id:`. The
   * server's upstream reader parses exactly that, so this route does the same.
   * A heartbeat keeps the reader from declaring the stream dead during a long
   * tool call.
   */
  app.get('/api/event', (req, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    const listener = (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    wireListeners.add(listener);
    listener({ id: `evt_${crypto.randomUUID()}`, created: Date.now(), type: 'server.connected', data: {} });
    const heartbeat = setInterval(() => res.write(':\n\n'), SSE_HEARTBEAT_MS);
    heartbeat.unref?.();
    req.on('close', () => {
      clearInterval(heartbeat);
      wireListeners.delete(listener);
    });
  });

  app.use('/api', (req, res) => {
    log.warn(`[pi] unimplemented route: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: 'Not implemented by the pi backend' });
  });

  return app;
};
