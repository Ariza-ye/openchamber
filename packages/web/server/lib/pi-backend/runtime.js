/**
 * The pi processes Pichamber runs.
 *
 * pi holds one session per process (`--session <file>`), and a process reads
 * its project configuration from its working directory. So the unit is one
 * process per session: two sessions run side by side, and neither waits for the
 * other's `switch_session`.
 *
 * A process starts on the first prompt and closes after `idleShutdownMs` with
 * no run in flight, so browsing sessions does not leave a fleet of Node
 * processes behind.
 *
 * Every stdout record is decoded here (`./schemas.js`) before listeners see it.
 */
import { createPiRpcProcess } from './rpc-process.js';

const IDLE_SHUTDOWN_MS = 10 * 60 * 1000;

export const createPiRuntime = ({
  binary,
  env,
  log = console,
  idleShutdownMs = IDLE_SHUTDOWN_MS,
}) => {
  /** sessionID -> entry */
  const entries = new Map();
  const listeners = new Set();

  const emit = (sessionID, directory, record) => {
    for (const listener of Array.from(listeners)) {
      try {
        listener({ sessionID, directory, record });
      } catch (error) {
        log.warn(`[pi] event listener failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  const attach = (entry) => {
    entry.process = createPiRpcProcess({
      binary,
      args: ['--mode', 'rpc', '--session', entry.sessionFile],
      cwd: entry.directory,
      env,
      onRecord: (record) => {
        if (record.kind === 'response') return;
        if (record.kind === 'extension-ui') {
          entry.process?.send({ type: 'extension_ui_response', id: record.request.id, cancelled: true });
          return;
        }
        if (record.kind === 'other') {
          if (record.type === 'agent_start') entry.busy = true;
          return;
        }
        if (record.kind === 'settled') entry.busy = false;
        emit(entry.sessionID, entry.directory, record);
      },
      onExit: (error) => {
        entry.busy = false;
        if (entries.get(entry.sessionID) === entry) entries.delete(entry.sessionID);
        log.warn(`[pi] process for ${entry.sessionID} exited: ${error.message}`);
      },
    });
  };

  const scheduleIdleShutdown = (entry) => {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = null;
      if (entry.busy) {
        scheduleIdleShutdown(entry);
        return;
      }
      void entry.process?.close();
    }, idleShutdownMs);
    entry.idleTimer.unref?.();
  };

  /**
   * The running process for a session, started on demand.
   *
   * `sessionFile` and `directory` are fixed for a session: one file under one
   * project.
   */
  const ensure = ({ sessionID, directory, sessionFile }) => {
    const existing = entries.get(sessionID);
    if (existing?.process?.isRunning()) {
      if (existing.idleTimer) {
        clearTimeout(existing.idleTimer);
        existing.idleTimer = null;
      }
      return existing;
    }
    const entry = { sessionID, directory, sessionFile, process: null, busy: false, idleTimer: null };
    attach(entry);
    entries.set(sessionID, entry);
    scheduleIdleShutdown(entry);
    return entry;
  };

  const closeSession = async (sessionID) => {
    const entry = entries.get(sessionID);
    if (!entry) return;
    entries.delete(sessionID);
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    await entry.process?.close();
  };

  const closeAll = async () => {
    const all = Array.from(entries.values());
    entries.clear();
    await Promise.all(all.map((entry) => {
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      return entry.process?.close();
    }));
  };

  return {
    ensure,
    closeSession,
    closeAll,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isBusy: (sessionID) => entries.get(sessionID)?.busy === true,
    busySessionIDs: () => Array.from(entries.values()).filter((entry) => entry.busy).map((entry) => entry.sessionID),
  };
};
