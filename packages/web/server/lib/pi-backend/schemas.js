/**
 * The schemas at pi's boundaries.
 *
 * Everything the adapter reads from outside itself is parsed here first: RPC
 * records on a child's stdout, the JSONL entries of a session file, and the
 * JSON configuration files under the agent directory. Downstream code then
 * branches on the decoded values instead of re-checking shapes.
 *
 * The schemas are permissive on purpose. pi's files belong to the user, and a
 * field this adapter does not know about must not make a session unreadable;
 * unknown keys are stripped and a malformed entry is skipped on its own.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const textBlockSchema = z.object({ type: z.literal('text'), text: z.string() });
const thinkingBlockSchema = z.object({ type: z.literal('thinking'), thinking: z.string() });
const toolCallBlockSchema = z.object({
  type: z.literal('toolCall'),
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});
const imageBlockSchema = z.object({
  type: z.literal('image'),
  data: z.string(),
  mimeType: z.string().optional(),
});
const unknownBlockSchema = z.object({ type: z.string() }).passthrough();

const contentBlockSchema = z.union([textBlockSchema, thinkingBlockSchema, toolCallBlockSchema, imageBlockSchema, unknownBlockSchema]);
// A plain string is the wire's shorthand for one text block; normalising it
// here means every caller branches on blocks, never on a string-or-array union.
const messageContentSchema = z.union([
  z.string().transform((value) => [{ type: 'text', text: value }]),
  z.array(contentBlockSchema),
]);

const usageSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
  reasoning: z.number().optional(),
  cacheRead: z.number().optional(),
  cacheWrite: z.number().optional(),
  cost: z.object({ total: z.number() }).passthrough().optional(),
}).passthrough();

const userMessageSchema = z.object({
  role: z.literal('user'),
  content: messageContentSchema,
  timestamp: z.number().optional(),
}).passthrough();

const assistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.array(contentBlockSchema),
  provider: z.string().optional(),
  model: z.string().optional(),
  usage: usageSchema.optional(),
  stopReason: z.string().optional(),
  errorMessage: z.string().optional(),
  timestamp: z.number().optional(),
}).passthrough();

const toolResultMessageSchema = z.object({
  role: z.literal('toolResult'),
  toolCallId: z.string(),
  toolName: z.string().optional(),
  content: messageContentSchema.optional(),
  details: z.unknown().optional(),
  isError: z.boolean().optional(),
  timestamp: z.number().optional(),
}).passthrough();

const systemMessageSchema = z.object({ role: z.literal('system') }).passthrough();

const messageSchema = z.discriminatedUnion('role', [
  userMessageSchema,
  assistantMessageSchema,
  toolResultMessageSchema,
  systemMessageSchema,
]);

// ---------------------------------------------------------------------------
// RPC records
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  type: z.literal('response'),
  id: z.string().optional(),
  command: z.string().optional(),
  success: z.boolean(),
  error: z.string().optional(),
  data: z.unknown().optional(),
});

const extensionUiSchema = z.object({
  type: z.literal('extension_ui_request'),
  id: z.string(),
  method: z.string(),
}).passthrough();

const streamBlockSchema = z.object({
  type: z.string(),
  contentIndex: z.number().optional(),
  delta: z.string().optional(),
  content: z.string().optional(),
  id: z.string().optional(),
  toolName: z.string().optional(),
  error: z.string().optional(),
  reason: z.string().optional(),
  toolCall: z.object({
    type: z.literal('toolCall'),
    id: z.string(),
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()).optional(),
  }).passthrough().optional(),
}).passthrough();

const messageStartSchema = z.object({ type: z.literal('message_start'), message: messageSchema }).passthrough();
const messageUpdateSchema = z.object({
  type: z.literal('message_update'),
  assistantMessageEvent: streamBlockSchema,
}).passthrough();
const messageEndSchema = z.object({ type: z.literal('message_end'), message: messageSchema }).passthrough();

const toolStartSchema = z.object({
  type: z.literal('tool_execution_start'),
  toolCallId: z.string(),
  toolName: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
}).passthrough();
const toolUpdateSchema = z.object({
  type: z.literal('tool_execution_update'),
  toolCallId: z.string(),
  partialResult: z.object({ content: messageContentSchema.optional() }).passthrough().optional(),
}).passthrough();
const toolEndSchema = z.object({
  type: z.literal('tool_execution_end'),
  toolCallId: z.string(),
  result: z.object({
    content: messageContentSchema.optional(),
    details: z.unknown().optional(),
  }).passthrough().optional(),
  isError: z.boolean().optional(),
}).passthrough();
const settledSchema = z.object({ type: z.literal('agent_settled'), aborted: z.boolean().optional() }).passthrough();
const compactionStartSchema = z.object({ type: z.literal('compaction_start'), reason: z.string().optional() }).passthrough();
const compactionEndSchema = z.object({
  type: z.literal('compaction_end'),
  aborted: z.boolean().optional(),
  errorMessage: z.string().optional(),
}).passthrough();
const retrySchema = z.object({
  type: z.literal('auto_retry_start'),
  attempt: z.number().optional(),
  errorMessage: z.string().optional(),
}).passthrough();
const ignoredSchema = z.object({ type: z.string() }).passthrough();

/**
 * One stdout line, decoded into the tag the translator branches on.
 *
 * `response` and `extension_ui_request` are the protocol's control records;
 * everything else is a session event. An event this adapter does not model
 * lands as `other`.
 */
export const parseRpcRecord = (line) => {
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const response = responseSchema.safeParse(raw);
  if (response.success) return { kind: 'response', response: response.data };
  const extension = extensionUiSchema.safeParse(raw);
  if (extension.success) return { kind: 'extension-ui', request: extension.data };

  const messageStart = messageStartSchema.safeParse(raw);
  if (messageStart.success) return { kind: 'message-start', message: messageStart.data.message };
  const messageUpdate = messageUpdateSchema.safeParse(raw);
  if (messageUpdate.success) return { kind: 'message-update', event: messageUpdate.data.assistantMessageEvent };
  const messageEnd = messageEndSchema.safeParse(raw);
  if (messageEnd.success) return { kind: 'message-end', message: messageEnd.data.message };
  const toolStart = toolStartSchema.safeParse(raw);
  if (toolStart.success) {
    return {
      kind: 'tool-start',
      toolCallId: toolStart.data.toolCallId,
      toolName: toolStart.data.toolName ?? 'tool',
      args: toolStart.data.args ?? {},
    };
  }
  const toolUpdate = toolUpdateSchema.safeParse(raw);
  if (toolUpdate.success) {
    return { kind: 'tool-update', toolCallId: toolUpdate.data.toolCallId, content: toolUpdate.data.partialResult?.content };
  }
  const toolEnd = toolEndSchema.safeParse(raw);
  if (toolEnd.success) {
    return {
      kind: 'tool-end',
      toolCallId: toolEnd.data.toolCallId,
      content: toolEnd.data.result?.content,
      details: toolEnd.data.result?.details,
      isError: toolEnd.data.isError === true,
    };
  }
  const settled = settledSchema.safeParse(raw);
  if (settled.success) return { kind: 'settled', aborted: settled.data.aborted === true };
  const compactionStart = compactionStartSchema.safeParse(raw);
  if (compactionStart.success) return { kind: 'compaction-start', reason: compactionStart.data.reason ?? '' };
  const compactionEnd = compactionEndSchema.safeParse(raw);
  if (compactionEnd.success) {
    return {
      kind: 'compaction-end',
      aborted: compactionEnd.data.aborted === true,
      error: compactionEnd.data.errorMessage ?? '',
    };
  }
  const retry = retrySchema.safeParse(raw);
  if (retry.success) {
    return { kind: 'retry', attempt: retry.data.attempt ?? 1, message: retry.data.errorMessage ?? '' };
  }
  const ignored = ignoredSchema.safeParse(raw);
  return ignored.success ? { kind: 'other', type: ignored.data.type } : null;
};

// ---------------------------------------------------------------------------
// Session files
// ---------------------------------------------------------------------------

const sessionHeaderSchema = z.object({
  type: z.literal('session'),
  id: z.string(),
  cwd: z.string().optional(),
  timestamp: z.string().optional(),
  parentSession: z.string().optional(),
  version: z.number().optional(),
}).passthrough();

const sessionEntrySchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  parentId: z.string().nullish(),
  timestamp: z.string().optional(),
  message: messageSchema.optional(),
  name: z.string().optional(),
  summary: z.string().optional(),
  provider: z.string().optional(),
  modelId: z.string().optional(),
}).passthrough();

/**
 * One session-file line, decoded into the tag the projection branches on.
 *
 * `header` for the first line, `message` for a conversation entry, and one tag
 * each for the few other entry kinds the projection reads. Everything else is
 * `other`.
 */
export const parseSessionLine = (line) => {
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const header = sessionHeaderSchema.safeParse(raw);
  if (header.success) return { kind: 'header', header: header.data };
  const entry = sessionEntrySchema.safeParse(raw);
  if (!entry.success) return null;
  if (entry.data.type === 'message' && entry.data.message) {
    return { kind: 'message', entry: entry.data, message: entry.data.message };
  }
  if (entry.data.type === 'model_change') {
    return { kind: 'model-change', entry: entry.data, provider: entry.data.provider ?? '', modelId: entry.data.modelId ?? '' };
  }
  if (entry.data.type === 'session_info') {
    return { kind: 'session-info', entry: entry.data, name: entry.data.name ?? '' };
  }
  if (entry.data.type === 'compaction') {
    return { kind: 'compaction', entry: entry.data, summary: entry.data.summary ?? '' };
  }
  return { kind: 'other', entry: entry.data };
};

// ---------------------------------------------------------------------------
// Agent-directory files
// ---------------------------------------------------------------------------

export const piSettingsSchema = z.object({
  defaultProvider: z.string().optional(),
  defaultModel: z.string().optional(),
  defaultThinkingLevel: z.string().optional(),
}).passthrough();

const endpointModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  api: z.string().optional(),
  reasoning: z.boolean().optional(),
  thinkingLevelMap: z.record(z.string(), z.string().nullable()).optional(),
  input: z.array(z.string()).optional(),
  cost: z.record(z.string(), z.unknown()).optional(),
  contextWindow: z.number().optional(),
  maxTokens: z.number().optional(),
}).passthrough();

const endpointSchema = z.object({
  api: z.string().optional(),
  baseUrl: z.string().optional(),
  models: z.array(endpointModelSchema).optional(),
}).passthrough();

export const piModelsFileSchema = z.object({
  providers: z.record(z.string(), endpointSchema).optional(),
}).passthrough();

export const piModelsStoreSchema = z.record(
  z.string(),
  z.object({ models: z.array(endpointModelSchema).optional() }).passthrough(),
);

export const piAuthFileSchema = z.record(
  z.string(),
  z.object({
    type: z.string().optional(),
    key: z.string().optional(),
    expires: z.number().optional(),
  }).passthrough(),
);

export const piMcpFileSchema = z.object({
  mcpServers: z.record(
    z.string(),
    z.object({
      url: z.string().optional(),
      command: z.union([z.string(), z.array(z.string())]).optional(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
      enabled: z.boolean().optional(),
      description: z.string().optional(),
    }).passthrough(),
  ).optional(),
}).passthrough();

export const parseJsonWith = (schema, text) => {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};
