/**
 * pi's configuration files, read into the records the Settings pages show.
 *
 * pi keeps its state as plain JSON under the agent directory: `settings.json`,
 * `models.json`, `models-store.json`, `auth.json`, `mcp.json`, plus `prompts/`,
 * `skills/` and `extensions/`. Every file is decoded with the schema that owns
 * its shape, so a hand-edited file fails at the read instead of leaking a
 * guessed shape into the settings UI.
 *
 * Credentials are never returned. `auth.json` holds API keys and OAuth tokens,
 * so only provider ids and their credential type leave this module.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  parseJsonWith,
  piAuthFileSchema,
  piMcpFileSchema,
  piModelsFileSchema,
  piModelsStoreSchema,
  piSettingsSchema,
} from './schemas.js';
import {
  piAuthFile,
  piCommandsDir,
  piExtensionsDir,
  piMcpFile,
  piModelsFile,
  piModelsStoreFile,
  piSettingsFile,
  piSkillsDir,
} from './paths.js';

const readJson = async (filePath, schema, fallback) => {
  let text;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
  return parseJsonWith(schema, text) ?? fallback;
};

const readDirEntries = async (dir) => {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

const readFrontmatterDescription = async (filePath) => {
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  const match = frontmatter ? /^description:\s*(.+)$/m.exec(frontmatter[1]) : null;
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : undefined;
};

const readPiSettings = async (agentDir) => readJson(piSettingsFile(agentDir), piSettingsSchema, {});

const projectModelEntry = (model, resolved) => ({
  id: model.id,
  name: resolved?.name || model.name || model.id,
  reasoning: resolved?.reasoning === true || model.reasoning === true,
  api: resolved?.api ?? model.api,
  input: resolved?.input ?? model.input ?? ['text'],
  cost: resolved?.cost ?? model.cost,
  contextWindow: resolved?.contextWindow ?? model.contextWindow,
  maxTokens: resolved?.maxTokens ?? model.maxTokens,
});

/**
 * pi's model catalog.
 *
 * `models.json` declares the endpoints the user configured; `models-store.json`
 * is pi's cached catalog keyed by provider, carrying the limits and prices pi
 * resolved. Both contribute: a built-in provider can have a cached catalog
 * without a configured endpoint, and an endpoint can exist before its catalog
 * is fetched.
 */
const readPiModelCatalog = async (agentDir) => {
  const configured = await readJson(piModelsFile(agentDir), piModelsFileSchema, {});
  const cached = await readJson(piModelsStoreFile(agentDir), piModelsStoreSchema, {});
  const endpoints = configured.providers ?? {};
  const seen = new Set();
  const providers = [];

  for (const [providerID, endpoint] of Object.entries(endpoints)) {
    seen.add(providerID);
    const cachedModels = cached[providerID]?.models ?? [];
    providers.push({
      providerID,
      baseUrl: endpoint.baseUrl,
      api: endpoint.api,
      configured: true,
      models: (endpoint.models ?? []).map((model) => (
        projectModelEntry(model, cachedModels.find((candidate) => candidate.id === model.id))
      )),
    });
  }

  for (const [providerID, entry] of Object.entries(cached)) {
    if (seen.has(providerID)) continue;
    providers.push({
      providerID,
      baseUrl: undefined,
      api: undefined,
      configured: false,
      models: (entry.models ?? []).map((model) => projectModelEntry(model, model)),
    });
  }

  return providers;
};

/** Provider ids with a saved credential, and whether each is a key or a login. */
const readPiCredentials = async (agentDir) => {
  const document = await readJson(piAuthFile(agentDir), piAuthFileSchema, {});
  return Object.entries(document).map(([providerID, value]) => ({
    providerID,
    type: value.type === 'oauth' ? 'oauth' : 'api',
    expires: value.expires,
  }));
};

/** The MCP servers pi is configured with. */
const readPiMcpServers = async (agentDir) => {
  const document = await readJson(piMcpFile(agentDir), piMcpFileSchema, {});
  return Object.entries(document.mcpServers ?? {}).map(([name, value]) => {
    const command = value.command;
    return {
      name,
      type: value.url ? 'remote' : 'local',
      url: value.url,
      command: Array.isArray(command) ? command : (command ? [command] : []),
      args: value.args ?? [],
      environment: Object.keys(value.env ?? {}),
      enabled: value.enabled !== false,
      description: value.description,
    };
  });
};

/**
 * Prompt templates pi exposes as slash commands.
 *
 * Each file in `prompts/` is a command named after the file, and a leading
 * frontmatter block may carry its description.
 */
export const readPiCommands = async (agentDir) => {
  const dir = piCommandsDir(agentDir);
  const entries = await readDirEntries(dir);
  const commands = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!['.md', '.markdown', '.txt'].includes(extension)) continue;
    const filePath = path.join(dir, entry.name);
    commands.push({
      name: path.basename(entry.name, extension),
      description: await readFrontmatterDescription(filePath),
      path: filePath,
    });
  }
  return commands.sort((left, right) => left.name.localeCompare(right.name));
};

/** Skills pi discovers, with the path of each `SKILL.md`. */
export const readPiSkills = async (agentDir) => {
  const dir = piSkillsDir(agentDir);
  const entries = await readDirEntries(dir);
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(dir, entry.name, 'SKILL.md');
    const description = await readFrontmatterDescription(skillFile);
    if (!description) continue;
    skills.push({ id: entry.name, name: entry.name, description, path: skillFile });
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
};

/** Extensions pi loads from its user directory. */
const readPiExtensions = async (agentDir) => {
  const dir = piExtensionsDir(agentDir);
  const entries = await readDirEntries(dir);
  return entries
    .map((entry) => ({
      id: entry.name.replace(/\.(ts|js|mjs|cjs)$/i, ''),
      name: entry.name,
      path: path.join(dir, entry.name),
      directory: entry.isDirectory(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

/** Everything the Settings pages ask for, in one read. */
export const readPiOverview = async (agentDir) => {
  const [settings, providers, credentials, mcp, commands, skills, extensions] = await Promise.all([
    readPiSettings(agentDir),
    readPiModelCatalog(agentDir),
    readPiCredentials(agentDir),
    readPiMcpServers(agentDir),
    readPiCommands(agentDir),
    readPiSkills(agentDir),
    readPiExtensions(agentDir),
  ]);
  return { settings, providers, credentials, mcp, commands, skills, extensions };
};
