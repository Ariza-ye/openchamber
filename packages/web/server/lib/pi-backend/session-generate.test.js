import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { OpenCode } from '@opencode/client';

import { createPiApiApp } from './api-app.js';
import { piSessionDirFor } from './paths.js';

const roots = [];
const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe.skipIf(process.platform === 'win32')('session generation', () => {
  test('uses a private session copy and preserves the original on success and failure', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-session-test-'));
    roots.push(root);
    const directory = path.join(root, 'project');
    const agentDir = path.join(root, 'agent');
    const sessionDir = piSessionDirFor(agentDir, directory);
    await fs.mkdir(directory, { recursive: true });
    await fs.mkdir(sessionDir, { recursive: true });
    const original = path.join(sessionDir, '2026_ses_test.jsonl');
    const history = `${JSON.stringify({ type: 'session', version: 3, id: 'ses_test', timestamp: new Date().toISOString(), cwd: directory })}\n`;
    await fs.writeFile(original, history);
    const binary = path.join(root, 'pi');
    await fs.writeFile(binary, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const file = args[args.indexOf('--session') + 1];
let prompt = '';
process.stdin.on('data', (chunk) => prompt += chunk);
process.stdin.on('end', () => {
  const history = fs.readFileSync(file, 'utf8');
  fs.appendFileSync(file, 'temporary');
  if (prompt === 'fail') { process.exit(1); return; }
  process.stdout.write(JSON.stringify({ history, prompt, file, cwd: process.cwd() }));
});
`, { mode: 0o755 });
    const runtime = { subscribe() {}, busySessionIDs: () => [] };
    const app = createPiApiApp({ express, runtime, agentDir, binary, log: { error() {} } });
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const client = OpenCode.make({ baseUrl, headers: { 'x-opencode-directory': encodeURIComponent(directory) } });
    const result = JSON.parse((await client.session.generate({ sessionID: 'ses_test', prompt: 'hello' })).text);
    expect(result.history).toBe(history);
    expect(result.prompt).toBe('hello');
    expect(result.cwd).toBe(await fs.realpath(directory));
    expect(await fs.readFile(original, 'utf8')).toBe(history);
    expect(await fs.stat(result.file).catch(() => null)).toBeNull();
    await expect(client.session.generate({ sessionID: 'ses_test', prompt: 'fail' })).rejects.toThrow();
    expect(await fs.readFile(original, 'utf8')).toBe(history);
    const missing = await fetch(`${baseUrl}/api/session/missing/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'hello' }),
    });
    expect(missing.status).toBe(404);
  });
});
