/**
 * One `pi --mode rpc` child process.
 *
 * pi speaks newline-delimited JSON on stdin and stdout: commands in, one
 * `response` per command plus session events out. This module owns exactly
 * that pipe, and decodes every stdout record before handing it on, so no caller
 * parses JSON or guesses a shape.
 *
 * Two rules the protocol makes load-bearing:
 *
 * - Records split on LF only. Node's `readline` also splits on U+2028 and
 *   U+2029, which are legal inside JSON strings, so the buffer is split by hand.
 * - stdout carries protocol records and nothing else. Diagnostics go to stderr
 *   and are kept as a bounded tail for error messages.
 */
import { spawn } from 'node:child_process';

import { parseRpcRecord } from './schemas.js';

const STDERR_TAIL_MAX_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

/** A pi process that exited, or a command it refused. */
class PiProcessError extends Error {
  constructor(message, { code = 'PI_ERROR', stderrTail = '' } = {}) {
    super(message);
    this.name = 'PiProcessError';
    this.code = code;
    this.stderrTail = stderrTail;
  }
}

const boundedTail = (value, maxBytes) => {
  const buffer = Buffer.from(String(value ?? ''));
  return buffer.byteLength <= maxBytes ? buffer.toString() : buffer.subarray(buffer.byteLength - maxBytes).toString();
};

/**
 * A live pi RPC child.
 *
 * `onRecord` receives every decoded non-response record. `onExit` fires once,
 * after pending requests have been rejected, so a caller can restart.
 */
export const createPiRpcProcess = ({
  binary,
  args,
  cwd,
  env,
  onRecord = () => {},
  onExit = () => {},
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
}) => {
  const child = spawn(binary, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

  let stdoutBuffer = '';
  let stderrTail = '';
  let sequence = 0;
  let exited = false;
  let exitReason = null;
  const pending = new Map();

  const settlePending = (error) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  };

  const handleRecord = (record) => {
    if (record.kind === 'response') {
      const response = record.response;
      const entry = response.id ? pending.get(response.id) : null;
      if (!entry) return;
      pending.delete(response.id);
      clearTimeout(entry.timer);
      if (response.success === false) {
        entry.reject(new PiProcessError(response.error ?? 'pi rejected the command', {
          code: 'PI_COMMAND_FAILED',
          stderrTail,
        }));
        return;
      }
      entry.resolve(response.data);
      return;
    }
    onRecord(record);
  };

  const consumeStdout = (chunk) => {
    stdoutBuffer += chunk;
    let newline = stdoutBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = stdoutBuffer.slice(0, newline).replace(/\r$/, '');
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (line.trim()) {
        const record = parseRpcRecord(line);
        if (record) handleRecord(record);
      }
      newline = stdoutBuffer.indexOf('\n');
    }
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', consumeStdout);
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrTail = boundedTail(`${stderrTail}${chunk}`, STDERR_TAIL_MAX_BYTES);
  });

  const fail = (error) => {
    if (exited) return;
    exited = true;
    exitReason = error;
    settlePending(error);
    onExit(error);
  };

  child.on('error', (error) => {
    fail(new PiProcessError(`Could not run ${binary}: ${error.message}`, { code: 'PI_SPAWN_FAILED' }));
  });
  child.on('exit', (code, signal) => {
    fail(new PiProcessError(
      signal ? `pi exited on signal ${signal}` : `pi exited with code ${code}`,
      { code: 'PI_EXITED', stderrTail },
    ));
  });

  /**
   * Sends one command and resolves with its `data`.
   *
   * pi answers a command once it has been accepted, not when the work is done,
   * so a resolved promise means "pi took it". Progress arrives through
   * `onRecord`.
   */
  const request = (command) => new Promise((resolve, reject) => {
    if (exited) {
      reject(exitReason ?? new PiProcessError('pi is not running', { code: 'PI_EXITED' }));
      return;
    }
    sequence += 1;
    const id = `oc${sequence}`;
    const timer = setTimeout(() => {
      if (!pending.delete(id)) return;
      reject(new PiProcessError(`pi did not answer ${command.type} within ${requestTimeoutMs}ms`, {
        code: 'PI_TIMEOUT',
        stderrTail,
      }));
    }, requestTimeoutMs);
    timer.unref?.();
    pending.set(id, { resolve, reject, timer });
    try {
      child.stdin.write(`${JSON.stringify({ ...command, id })}\n`);
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(new PiProcessError(`Could not write to pi: ${error.message}`, { code: 'PI_WRITE_FAILED' }));
    }
  });

  /** Fire-and-forget record (extension UI replies). Never throws. */
  const send = (record) => {
    if (exited) return;
    try {
      child.stdin.write(`${JSON.stringify(record)}\n`);
    } catch {
      // The process is gone; `onExit` reports it.
    }
  };

  /** Closes stdin, pi's orderly shutdown signal, and kills after `graceMs`. */
  const close = async (graceMs = 3000) => {
    if (exited) return;
    try {
      child.stdin.end();
    } catch {
      // Already closed.
    }
    await new Promise((resolve) => {
      if (exited) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Gone already.
        }
        resolve();
      }, graceMs);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };

  return {
    pid: child.pid ?? null,
    request,
    send,
    close,
    isRunning: () => !exited,
    getStderrTail: () => stderrTail,
  };
};
