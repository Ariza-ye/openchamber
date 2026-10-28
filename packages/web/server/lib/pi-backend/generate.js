/**
 * One `pi --print` run: the background model's transport.
 *
 * Pichamber's small-model routes call OpenCode's `/api/experimental/generate`
 * for a single answer from a named model. pi has no such RPC, and starting a
 * session just to throw the transcript away would write files and load tools
 * for nothing. `pi --print` is the interface for exactly this: one prompt in,
 * the final assistant text out, no session.
 *
 * `--no-context-files` keeps a project's `AGENTS.md` out of the system prompt.
 * The caller already put everything the answer needs in the prompt, and a
 * project's house rules must not rewrite a commit message.
 */
import { spawn } from 'node:child_process';

const STDERR_TAIL_MAX_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

const boundedTail = (value) => {
  const buffer = Buffer.from(String(value ?? ''));
  return buffer.byteLength <= STDERR_TAIL_MAX_BYTES
    ? buffer.toString()
    : buffer.subarray(buffer.byteLength - STDERR_TAIL_MAX_BYTES).toString();
};

class PiGenerateError extends Error {
  constructor(message, { stderrTail = '' } = {}) {
    super(message);
    this.name = 'PiGenerateError';
    this.stderrTail = stderrTail;
  }
}

/**
 * The assistant text for one prompt, or a rejection carrying pi's own reason.
 *
 * `directory` becomes the child's working directory, which is where pi reads
 * its provider and model configuration from; `env` carries the agent directory.
 */
export const generatePiText = ({
  binary = 'pi',
  env = process.env,
  providerID,
  modelID,
  sessionFile,
  prompt,
  directory,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) => new Promise((resolve, reject) => {
  const child = spawn(binary, [
    '--print',
    ...(sessionFile ? ['--session', sessionFile] : ['--no-session', '--provider', providerID, '--model', modelID]),
    '--no-tools',
    '--no-context-files',
  ], {
    cwd: directory,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let stdout = '';
  let stderrTail = '';
  let settled = false;

  const settle = (error, text) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error) {
      reject(error);
      return;
    }
    resolve(text);
  };

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrTail = boundedTail(`${stderrTail}${chunk}`);
  });

  child.on('error', (error) => {
    settle(new PiGenerateError(`Could not run ${binary}: ${error.message}`, { stderrTail }));
  });
  child.on('close', (code) => {
    if (timedOut) {
      settle(new PiGenerateError(`pi did not answer within ${timeoutMs}ms`, { stderrTail }));
      return;
    }
    if (code === 0) {
      settle(null, stdout.trim());
      return;
    }
    settle(new PiGenerateError(stderrTail.trim() || `pi exited with code ${code}`, { stderrTail }));
  });

  // A model that exits early closes the pipe under us; the exit code says why.
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);
});
