/**
 * Where pi keeps its state, and how a working directory maps onto it.
 *
 * pi stores sessions as JSONL under `<agent-dir>/sessions/--<encoded>--/`,
 * where `<encoded>` is the working directory with its leading separator
 * dropped and `/`, `\` and `:` replaced by `-`. The adapter reads those files
 * directly, so listing sessions costs no child process.
 *
 * The agent directory follows pi's own rule: `PI_CODING_AGENT_DIR`, else
 * `~/.pi/agent`.
 */
import os from 'node:os';
import path from 'node:path';

export const resolvePiAgentDir = (env = process.env) => {
  const configured = String(env.PI_CODING_AGENT_DIR ?? '').trim();
  return configured ? path.resolve(configured) : path.join(os.homedir(), '.pi', 'agent');
};

/** pi's directory name for a working directory (`--Users-me-project--`). */
const encodePiSessionDirName = (directory) => {
  const normalized = String(directory ?? '').trim();
  if (!normalized) return null;
  return `--${normalized.replace(/^[/\\]+/, '').replace(/[/\\:]/g, '-')}--`;
};

export const piSessionsRoot = (agentDir) => path.join(agentDir, 'sessions');

export const piSessionDirFor = (agentDir, directory) => {
  const name = encodePiSessionDirName(directory);
  return name ? path.join(piSessionsRoot(agentDir), name) : null;
};

/** The session id a file name carries: `<timestamp>_<id>.jsonl`. */
export const sessionIdFromFileName = (fileName) => {
  const base = String(fileName ?? '').replace(/\.jsonl$/i, '');
  const separator = base.indexOf('_');
  return separator >= 0 ? base.slice(separator + 1) : base;
};

export const piSettingsFile = (agentDir) => path.join(agentDir, 'settings.json');
export const piModelsFile = (agentDir) => path.join(agentDir, 'models.json');
export const piModelsStoreFile = (agentDir) => path.join(agentDir, 'models-store.json');
export const piAuthFile = (agentDir) => path.join(agentDir, 'auth.json');
export const piMcpFile = (agentDir) => path.join(agentDir, 'mcp.json');
export const piCommandsDir = (agentDir) => path.join(agentDir, 'prompts');
export const piSkillsDir = (agentDir) => path.join(agentDir, 'skills');
export const piExtensionsDir = (agentDir) => path.join(agentDir, 'extensions');
export const piInstructionsFile = (agentDir) => path.join(agentDir, 'AGENTS.md');
