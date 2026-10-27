/**
 * pi's session records, projected into OpenCode's wire shapes.
 *
 * Everything above this module speaks OpenCode: `SessionInfo`,
 * `SessionMessageInfo`, and the `session.*` event vocabulary. This file is the
 * only place that knows what pi calls things, so a wire-shape change lands here
 * rather than in the adapter.
 *
 * The input is already decoded (`./wire.js`), so this module branches on the
 * decoded kind and never re-checks a raw shape.
 */
import crypto from 'node:crypto';
import path from 'node:path';

import { activeBranch } from './session-store.js';

/** The single synthetic agent id every pi session runs as. */
export const PI_AGENT_ID = 'pi';

export const newEventId = () => `evt_${crypto.randomBytes(12).toString('base64url')}`;

const zeroTokens = () => ({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } });

export const projectIdForDirectory = (directory) => (
  `prj_${crypto.createHash('sha1').update(String(directory ?? '')).digest('hex').slice(0, 16)}`
);

/**
 * A message id that survives a reload.
 *
 * pi puts no id on the message itself, but its timestamp is stable across the
 * live RPC stream and the persisted entry, so deriving the id from it keeps a
 * streaming part attached to the message a later read returns.
 */
export const messageIdFromTimestamp = (timestamp) => `msg_${Math.trunc(timestamp)}`;

/** The text of a pi message's content, whether it is a string or blocks. */
export const contentText = (content) => {
  if (!Array.isArray(content)) return content;
  return content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('');
};

const imageFilesOf = (content) => {
  if (!Array.isArray(content)) return undefined;
  const images = content.flatMap((block) => (
    block.type === 'image' ? [{ mime: block.mimeType ?? 'image/png', data: block.data }] : []
  ));
  if (images.length === 0) return undefined;
  return images.map((image, index) => ({
    source: { type: 'inline' },
    mime: image.mime,
    name: `image-${index + 1}`,
    data: image.data,
  }));
};

export const projectTokens = (usage) => ({
  input: usage?.input ?? 0,
  output: usage?.output ?? 0,
  reasoning: usage?.reasoning ?? 0,
  cache: { read: usage?.cacheRead ?? 0, write: usage?.cacheWrite ?? 0 },
});

export const projectCost = (usage) => usage?.cost?.total ?? 0;

const finishOf = (stopReason) => {
  switch (stopReason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'toolUse':
      return 'tool-calls';
    case 'error':
    case 'aborted':
      return 'error';
    default:
      return 'unknown';
  }
};

/** One `toolCall` block → OpenCode's `tool` content item. */
const projectToolItem = (block, result, created) => {
  const input = block.arguments ?? {};
  const identity = { type: 'tool', id: block.id, name: block.name, time: { created } };
  if (!result) {
    return { ...identity, state: { status: 'streaming', input: JSON.stringify(input) } };
  }
  const completed = result.timestamp ?? created;
  const details = result.details ?? undefined;
  if (result.isError === true) {
    return {
      ...identity,
      time: { created, ran: created, completed },
      state: details
        ? {
          status: 'error',
          input,
          error: { type: 'ToolError', message: contentText(result.content) || 'The tool failed' },
          metadata: details,
        }
        : {
          status: 'error',
          input,
          error: { type: 'ToolError', message: contentText(result.content) || 'The tool failed' },
        },
    };
  }
  return {
    ...identity,
    time: { created, ran: created, completed },
    state: details
      ? { status: 'completed', input, content: [{ type: 'text', text: contentText(result.content) }], metadata: details }
      : { status: 'completed', input, content: [{ type: 'text', text: contentText(result.content) }] },
  };
};

/** One pi assistant message → OpenCode's ordered content items. */
const projectAssistantContent = (message, toolResults) => {
  const created = message.timestamp ?? Date.now();
  return message.content.flatMap((block) => {
    if (block.type === 'text') return [{ type: 'text', text: block.text }];
    if (block.type === 'thinking') {
      return [{ type: 'reasoning', text: block.thinking, time: { created, completed: created } }];
    }
    if (block.type === 'toolCall') {
      return [projectToolItem(block, toolResults.get(block.id), created)];
    }
    return [];
  });
};

const projectAssistant = (line, toolResults) => {
  const message = line.message;
  const created = message.timestamp ?? (Date.parse(line.entry.timestamp ?? '') || Date.now());
  const failed = message.stopReason === 'error' || message.stopReason === 'aborted';
  const result = {
    id: messageIdFromTimestamp(created),
    type: 'assistant',
    time: { created, completed: created },
    agent: PI_AGENT_ID,
    model: {
      providerID: message.provider ?? 'pi',
      id: message.model ?? 'default',
    },
    content: projectAssistantContent(message, toolResults),
    finish: finishOf(message.stopReason),
    cost: projectCost(message.usage),
    tokens: projectTokens(message.usage),
    ...(failed
      ? {
        error: {
          type: message.stopReason === 'aborted' ? 'MessageAbortedError' : 'ProviderError',
          message: message.errorMessage ?? 'The run stopped',
        },
      }
      : undefined),
  };
  return result;
};

const projectUser = (line) => {
  const message = line.message;
  const created = message.timestamp ?? (Date.parse(line.entry.timestamp ?? '') || Date.now());
  const files = imageFilesOf(message.content);
  const base = {
    id: messageIdFromTimestamp(created),
    type: 'user',
    time: { created },
    text: contentText(message.content),
  };
  return files ? { ...base, files } : base;
};

/**
 * The active branch of a pi session → OpenCode's message list.
 *
 * Tool results arrive as their own pi messages and become the state of the
 * tool part that called them, so they are collected first and folded in.
 * pi-only roles (system, shell, compaction summaries, extension messages) are
 * dropped: Pichamber has no surface for them.
 */
const projectSessionMessages = (branch) => {
  const toolResults = new Map();
  for (const line of branch) {
    if (line.kind !== 'message') continue;
    if (line.message.role !== 'toolResult') continue;
    toolResults.set(line.message.toolCallId, line.message);
  }

  const messages = [];
  for (const line of branch) {
    if (line.kind === 'message') {
      const role = line.message.role;
      if (role === 'user') {
        messages.push(projectUser(line));
        continue;
      }
      if (role === 'assistant') {
        messages.push(projectAssistant(line, toolResults));
        continue;
      }
      continue;
    }
    if (line.kind === 'compaction') {
      messages.push({
        id: line.entry.id ?? `cmp_${Date.parse(line.entry.timestamp ?? '') || Date.now()}`,
        type: 'compaction',
        time: { created: Date.parse(line.entry.timestamp ?? '') || Date.now() },
        status: 'completed',
        reason: 'auto',
        summary: line.summary,
      });
    }
  }
  return messages;
};

const TITLE_MAX_LENGTH = 120;

/** The session title: pi's `session_info` name, else the first user line. */
export const projectSessionTitle = (branch) => {
  let name = '';
  let firstUser = '';
  for (const line of branch) {
    if (line.kind === 'session-info' && line.name.trim()) name = line.name.trim();
    if (!firstUser && line.kind === 'message' && line.message.role === 'user') {
      firstUser = contentText(line.message.content).trim();
    }
  }
  if (name) return name;
  if (!firstUser) return '';
  const firstLine = firstUser.split('\n').find((candidate) => candidate.trim()) ?? '';
  return firstLine.trim().slice(0, TITLE_MAX_LENGTH);
};

/** The last model a session selected, from its `model_change` entries. */
const projectSessionModel = (branch) => {
  let model = null;
  for (const line of branch) {
    if (line.kind !== 'model-change') continue;
    if (!line.provider || !line.modelId) continue;
    model = { providerID: line.provider, id: line.modelId };
  }
  return model;
};

/** Every assistant message's totals, for the session row's usage column. */
const projectSessionUsage = (branch) => {
  let cost = 0;
  const tokens = zeroTokens();
  for (const line of branch) {
    if (line.kind !== 'message' || line.message.role !== 'assistant') continue;
    cost += projectCost(line.message.usage);
    const used = projectTokens(line.message.usage);
    tokens.input += used.input;
    tokens.output += used.output;
    tokens.reasoning += used.reasoning;
    tokens.cache.read += used.cache.read;
    tokens.cache.write += used.cache.write;
  }
  return { cost, tokens };
};

/** One session file's facts → OpenCode's `SessionInfo`. */
export const projectSessionFile = ({ filePath, header, lines, updatedAt, directoryHint = null }) => {
  const directory = header?.cwd ?? directoryHint;
  if (!directory) return null;
  const branch = activeBranch(lines);
  const created = (Date.parse(header?.timestamp ?? '') || updatedAt || Date.now());
  const id = header?.id ?? sessionIdOf(filePath);
  const { cost, tokens } = projectSessionUsage(branch);
  const model = projectSessionModel(branch);
  return {
    id,
    projectID: projectIdForDirectory(directory),
    location: { directory },
    title: projectSessionTitle(branch),
    agent: PI_AGENT_ID,
    ...(model ? { model } : undefined),
    cost,
    tokens,
    time: { created: Math.trunc(created), updated: Math.trunc(updatedAt ?? created) },
  };
};

const sessionIdOf = (filePath) => {
  const base = path.basename(filePath, '.jsonl');
  const separator = base.indexOf('_');
  return separator >= 0 ? base.slice(separator + 1) : base;
};

/** One session file → OpenCode's message list. */
export const projectSessionFileMessages = (lines) => projectSessionMessages(activeBranch(lines));
