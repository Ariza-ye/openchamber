import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { generatePiText } from './generate.js';

const roots = [];

/** A stand-in for the pi binary: reads the prompt, then does what the body says. */
const fakePi = async (body) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-generate-'));
  roots.push(root);
  const binary = path.join(root, 'pi');
  await fs.writeFile(binary, `#!/usr/bin/env node\nconst chunks = [];\nprocess.stdin.on('data', (chunk) => chunks.push(chunk));\nprocess.stdin.on('end', () => {\n  const prompt = Buffer.concat(chunks).toString();\n  ${body}\n});\n`, { mode: 0o755 });
  return { root, binary };
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const generate = (binary, overrides = {}) => generatePiText({
  binary,
  providerID: 'magpie',
  modelID: 'group/auto-gpt-6.1-terra',
  prompt: 'summarize this diff',
  directory: os.tmpdir(),
  ...overrides,
});

describe.skipIf(process.platform === 'win32')('generatePiText', () => {
  test('answers with the assistant text', async () => {
    const { binary } = await fakePi('process.stdout.write(`echo:${prompt}`);');

    await expect(generate(binary)).resolves.toBe('echo:summarize this diff');
  });

  test('passes the model and refuses tools, sessions and context files', async () => {
    const { binary } = await fakePi('process.stdout.write(JSON.stringify(process.argv.slice(2)));');

    const argv = JSON.parse(await generate(binary)).join(' ');

    expect(argv).toContain('--print');
    expect(argv).toContain('--no-session');
    expect(argv).toContain('--no-tools');
    expect(argv).toContain('--no-context-files');
    expect(argv).toContain('--provider magpie');
    expect(argv).toContain('--model group/auto-gpt-6.1-terra');
  });

  test('rejects with pi\'s stderr when the run fails', async () => {
    const { binary } = await fakePi('process.stderr.write("model not found"); process.exit(2);');

    await expect(generate(binary)).rejects.toThrow('model not found');
  });

  test('rejects when the run overstays its timeout', async () => {
    const { binary } = await fakePi('setTimeout(() => process.stdout.write("late"), 1000);');

    await expect(generate(binary, { timeoutMs: 100 })).rejects.toThrow('did not answer within 100ms');
  });
});
