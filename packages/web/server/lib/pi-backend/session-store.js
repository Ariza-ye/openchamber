/**
 * Reading pi's session files.
 *
 * A session is one JSONL file: a header line, then a tree of entries linked by
 * `id`/`parentId`. Only the active branch matters to the UI, because that is
 * the transcript the user last saw.
 *
 * Reading the files instead of asking a live process keeps the session list
 * cheap: one process per project in the sidebar would be a fleet of Node
 * processes just to render a list.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { piSessionDirFor, piSessionsRoot, sessionIdFromFileName } from './paths.js';
import { parseSessionLine } from './schemas.js';

const LIST_LIMIT = 500;

/** The header and every entry of one session file. */
export const readSession = async (filePath) => {
  let text;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch {
    return { header: null, lines: [] };
  }
  let header = null;
  const lines = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const decoded = parseSessionLine(line);
    if (!decoded) continue;
    if (decoded.kind === 'header') {
      header = decoded.header;
      continue;
    }
    lines.push(decoded);
  }
  return { header, lines };
};

/**
 * The entries of the active branch, root first.
 *
 * pi appends entries and keeps a leaf pointer; the branch is that leaf's
 * ancestor chain. The newest entry without children is the leaf, which is what
 * the user last saw when the session was closed.
 */
export const activeBranch = (lines) => {
  if (lines.length === 0) return [];
  const byId = new Map();
  for (const line of lines) {
    if (line.entry?.id) byId.set(line.entry.id, line);
  }
  const hasChild = new Set();
  for (const line of lines) {
    if (line.entry?.parentId) hasChild.add(line.entry.parentId);
  }
  const leaves = lines.filter((line) => line.entry?.id && !hasChild.has(line.entry.id));
  const leaf = leaves.length > 0 ? leaves[leaves.length - 1] : lines[lines.length - 1];
  const branch = [];
  const seen = new Set();
  let cursor = leaf;
  while (cursor?.entry?.id && !seen.has(cursor.entry.id)) {
    seen.add(cursor.entry.id);
    branch.push(cursor);
    cursor = cursor.entry.parentId ? byId.get(cursor.entry.parentId) ?? null : null;
  }
  return branch.reverse();
};

const readDirFiles = async (dir) => {
  try {
    const names = await fs.readdir(dir);
    return names.filter((name) => name.endsWith('.jsonl')).map((name) => path.join(dir, name));
  } catch {
    return [];
  }
};

/** Session files of one directory, or of every directory pi has written to. */
const listPiSessionFiles = async ({ agentDir, directory }) => {
  if (directory) {
    const dir = piSessionDirFor(agentDir, directory);
    return dir ? readDirFiles(dir) : [];
  }
  let projectDirs = [];
  try {
    projectDirs = (await fs.readdir(piSessionsRoot(agentDir), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(piSessionsRoot(agentDir), entry.name));
  } catch {
    return [];
  }
  const nested = await Promise.all(projectDirs.map((dir) => readDirFiles(dir)));
  return nested.flat();
};

export const statOf = async (filePath) => {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
};

/** Session files with their timestamps, newest first, capped. */
export const listSessionFilesNewestFirst = async ({ agentDir, directory, limit = LIST_LIMIT }) => {
  const files = await listPiSessionFiles({ agentDir, directory });
  const rows = await Promise.all(files.map(async (filePath) => {
    const stat = await statOf(filePath);
    return stat ? { filePath, updatedAt: stat.mtimeMs, createdAt: stat.birthtimeMs || stat.mtimeMs } : null;
  }));
  return rows
    .filter((row) => row !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit);
};

/** The file a session id lives in, or null. */
export const findPiSessionFile = async ({ agentDir, sessionID, directory }) => {
  const scoped = await listPiSessionFiles({ agentDir, directory });
  for (const filePath of scoped) {
    if (sessionIdFromFileName(path.basename(filePath)) === sessionID) return filePath;
  }
  // A file pi named before it knew the id can still carry it in the header.
  for (const filePath of scoped) {
    const { header } = await readSession(filePath);
    if (header?.id === sessionID) return filePath;
  }
  if (directory) {
    // The caller's directory may be wrong for a session that moved.
    return findPiSessionFile({ agentDir, sessionID, directory: null });
  }
  return null;
};
