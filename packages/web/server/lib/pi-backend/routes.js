/**
 * Pichamber's own routes for the pi backend.
 *
 * These live beside `/api` rather than inside it: they are not part of the
 * OpenCode wire contract, they are the Settings pages asking this instance what
 * its pi install looks like. Mounted on the main app, so they answer whether or
 * not pi is the active backend — the pages need to describe an unavailable pi
 * too.
 *
 * Nothing here returns a credential value. `auth.json` holds API keys and
 * OAuth tokens; the pages only need to know which providers have one.
 */
import { execFile } from 'node:child_process';
import { z } from 'zod';
import { promisify } from 'node:util';

import { readPiOverview } from './config.js';
import fs from 'node:fs/promises';
import path from 'node:path';

import { piInstructionsFile, piModelsFile, piSettingsFile, resolvePiAgentDir } from './paths.js';

const run = promisify(execFile);

const readPiVersion = async (binary, env) => {
  try {
    const { stdout } = await run(binary, ['--version'], { env, timeout: 10_000, encoding: 'utf8' });
    const match = /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(stdout);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

export const registerPiRoutes = (app, deps) => {
  const {
    readSettingsFromDiskMigrated,
    buildAugmentedPath = () => process.env.PATH ?? '',
  } = deps;

  const env = () => ({ ...process.env, PATH: buildAugmentedPath() });
  const agentDir = () => resolvePiAgentDir(env());

  const resolveBinary = async () => {
    const settings = await readSettingsFromDiskMigrated().catch(() => null);
    return String(settings?.piBinary ?? '').trim() || 'pi';
  };

  /**
   * What the Settings pages need in one read: whether pi answers at all, where
   * its files live, and the catalogs they list. A missing binary is reported,
   * not thrown, so the pages can explain it.
   */
  app.get('/api/pi/overview', async (_req, res) => {
    const binary = await resolveBinary();
    const [version, overview] = await Promise.all([
      readPiVersion(binary, env()),
      readPiOverview(agentDir()),
    ]);
    res.json({
      available: version !== null,
      binary,
      version,
      agentDir: agentDir(),
      files: {
        settings: piSettingsFile(agentDir()),
        models: piModelsFile(agentDir()),
      },
      settings: {
        defaultProvider: overview.settings.defaultProvider ?? null,
        defaultModel: overview.settings.defaultModel ?? null,
        defaultThinkingLevel: overview.settings.defaultThinkingLevel ?? null,
      },
      providers: overview.providers.map((provider) => ({
        id: provider.providerID,
        name: provider.providerID,
        baseUrl: provider.baseUrl ?? null,
        api: provider.api ?? null,
        configured: provider.configured,
        models: provider.models,
        credential: overview.credentials.find((entry) => entry.providerID === provider.providerID)?.type ?? null,
      })),
      mcp: overview.mcp,
      commands: overview.commands,
      skills: overview.skills,
      extensions: overview.extensions,
    });
  });

  /**
   * pi's instructions file, the closest thing it has to OpenCode's Behavior
   * page: `AGENTS.md` in the agent directory.
   */
  app.get('/api/pi/instructions', async (_req, res) => {
    const filePath = piInstructionsFile(agentDir());
    try {
      res.json({ path: filePath, text: await fs.readFile(filePath, 'utf8') });
    } catch (error) {
      if (error?.code === 'ENOENT') return res.json({ path: filePath, text: '' });
      res.status(500).json({ error: 'Could not read pi instructions' });
    }
  });

  app.put('/api/pi/instructions', async (req, res) => {
    const parsed = String(req.body?.text ?? '');
    if (Buffer.byteLength(parsed, 'utf8') > 1024 * 1024) {
      return res.status(413).json({ error: 'Instructions are too large' });
    }
    const filePath = piInstructionsFile(agentDir());
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${process.pid}.tmp`;
      await fs.writeFile(temporary, parsed, 'utf8');
      await fs.rename(temporary, filePath);
      res.json({ path: filePath, text: parsed });
    } catch {
      res.status(500).json({ error: 'Could not save pi instructions' });
    }
  });

  /**
   * pi's AGENTS.md: the instruction file it reads for every session.
   *
   * pi owns the rest of its configuration, but this one file is the direct
   * equivalent of OpenCode's instructions page and is safe to edit here.
   */
  app.get('/api/pi/instructions', async (_req, res) => {
    const filePath = piInstructionsFile(agentDir());
    try {
      const parsed = await fs.readFile(filePath, 'utf8');
      res.json({ path: filePath, text: parsed });
    } catch (error) {
      if (error?.code === 'ENOENT') return res.json({ path: filePath, text: '' });
      console.error('[API:GET /api/pi/instructions]', error);
      return res.status(500).json({ error: 'Could not read pi instructions' });
    }
  });

  app.put('/api/pi/instructions', async (req, res) => {
    const parsed = z.string().safeParse(req.body?.text);
    if (!parsed.success) return res.status(400).json({ error: 'text must be a string' });
    if (Buffer.byteLength(parsed.data, 'utf8') > 1024 * 1024) {
      return res.status(413).json({ error: 'Instructions are too large' });
    }
    const filePath = piInstructionsFile(agentDir());
    try {
      await fs.mkdir(agentDir(), { recursive: true });
      const temporary = `${filePath}.${process.pid}.tmp`;
      await fs.writeFile(temporary, parsed.data, 'utf8');
      await fs.rename(temporary, filePath);
      res.json({ path: filePath, text: parsed.data });
    } catch (error) {
      console.error('[API:PUT /api/pi/instructions]', error);
      res.status(500).json({ error: 'Could not save pi instructions' });
    }
  });

  app.get('/api/pi/status', async (_req, res) => {
    const binary = await resolveBinary();
    const version = await readPiVersion(binary, env());
    res.json({ available: version !== null, binary, version, agentDir: agentDir() });
  });
};
