/**
 * pi RPC session events → OpenCode 2.x wire events.
 *
 * The browser reduces OpenCode's event vocabulary and depends on ordering:
 *
 * - `session.step.started` before any text or tool event of that step, or a
 *   part arrives with no owning message;
 * - `session.text.started` before `session.text.delta`;
 * - `session.tool.input.started` before `session.tool.called`;
 * - `session.step.ended` carries `finish` and token totals; an execution event
 *   alone leaves the turn looking unfinished.
 *
 * pi streams one assistant message at a time and reports tool execution
 * separately, so this translator mints the ids and emits the OpenCode events in
 * the order the reducer expects. The input is already decoded by
 * `./schemas.js`, so every branch below is on a decoded tag.
 */
import {
  contentText,
  messageIdFromTimestamp,
  newEventId,
  projectCost,
  projectTokens,
} from './projection.js';

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

/**
 * One translator per session.
 *
 * `emit` receives finished wire events; the caller hands them to the same hub
 * an OpenCode event goes through, so the browser cannot tell the two apart.
 */
export const createPiEventTranslator = ({ sessionID, directory, emit }) => {
  let messageID = null;
  let stepOpen = false;
  let failed = null;
  let aborted = false;
  const startedTools = new Set();
  const openedBlocks = new Set();
  const ordinals = new Map();
  /**
   * Tool call id → the assistant message that called it.
   *
   * pi reports `tool_execution_*` after the assistant `message_end`, so the
   * message in flight is no longer the owner by then. Keeping the mapping for
   * the run is what lets the tool part move from running to completed.
   */
  const toolOwners = new Map();

  const send = (type, data) => {
    emit({
      id: newEventId(),
      created: Date.now(),
      type,
      location: { directory },
      data: Object.assign({ sessionID }, data),
    });
  };

  /** Ordinals count per kind in content order, matching the reload projection. */
  const ordinalOf = (kind, index) => {
    const key = `${kind}:${index}`;
    const existing = ordinals.get(key);
    if (existing !== undefined) return existing;
    const used = Array.from(ordinals.keys()).filter((entry) => entry.startsWith(`${kind}:`)).length;
    ordinals.set(key, used);
    return used;
  };

  const openBlock = (kind, index) => {
    const key = `${kind}:${index}`;
    const ordinal = ordinalOf(kind, index);
    if (!openedBlocks.has(key)) {
      openedBlocks.add(key);
      send(kind === 'reasoning' ? 'session.reasoning.started' : 'session.text.started', {
        assistantMessageID: messageID,
        ordinal,
      });
    }
    return ordinal;
  };

  const beginStep = (message) => {
    // The same timestamp the persisted entry carries, so a reloaded transcript
    // keeps the ids the live stream used.
    messageID = messageIdFromTimestamp(message.timestamp ?? Date.now());
    stepOpen = true;
    startedTools.clear();
    openedBlocks.clear();
    ordinals.clear();
    toolOwners.clear();
    send('session.step.started', {
      assistantMessageID: messageID,
      agent: 'pi',
      model: { providerID: message.provider ?? 'pi', id: message.model ?? 'default' },
      started: message.timestamp ?? Date.now(),
    });
    send('session.execution.started', {});
  };

  const endStep = (message) => {
    if (!stepOpen || !messageID) return;
    const isError = message.stopReason === 'error' || message.stopReason === 'aborted';
    if (isError) {
      send('session.step.failed', {
        assistantMessageID: messageID,
        finish: 'error',
        error: {
          type: message.stopReason === 'aborted' ? 'MessageAbortedError' : 'ProviderError',
          message: message.errorMessage ?? 'The run stopped',
        },
        cost: projectCost(message.usage),
        tokens: projectTokens(message.usage),
      });
    } else {
      send('session.step.ended', {
        assistantMessageID: messageID,
        finish: finishOf(message.stopReason),
        cost: projectCost(message.usage),
        tokens: projectTokens(message.usage),
      });
    }
    stepOpen = false;
  };

  /** Emits the closing snapshot of every text and reasoning block of a message. */
  const closeBlocks = (message) => {
    if (!messageID) return;
    message.content.forEach((block, index) => {
      if (block.type === 'text') {
        send('session.text.ended', { assistantMessageID: messageID, ordinal: ordinalOf('text', index), text: block.text });
      }
      if (block.type === 'thinking') {
        send('session.reasoning.ended', {
          assistantMessageID: messageID,
          ordinal: ordinalOf('reasoning', index),
          text: block.thinking,
        });
      }
    });
  };

  const handleDelta = (event) => {
    if (!messageID) return;
    const index = event.contentIndex ?? 0;
    switch (event.type) {
      case 'text_start':
        openBlock('text', index);
        return;
      case 'text_delta':
        send('session.text.delta', {
          assistantMessageID: messageID,
          ordinal: openBlock('text', index),
          delta: event.delta ?? '',
        });
        return;
      case 'thinking_start':
        openBlock('reasoning', index);
        return;
      case 'thinking_delta':
        send('session.reasoning.delta', {
          assistantMessageID: messageID,
          ordinal: openBlock('reasoning', index),
          delta: event.delta ?? '',
        });
        return;
      case 'toolcall_start': {
        const callId = event.id ?? '';
        if (!callId) return;
        startedTools.add(callId);
        toolOwners.set(callId, messageID);
        send('session.tool.input.started', {
          assistantMessageID: messageID,
          id: callId,
          name: event.toolName ?? 'tool',
        });
        return;
      }
      case 'toolcall_delta': {
        const callId = event.id ?? '';
        if (!callId) return;
        send('session.tool.input.delta', { assistantMessageID: messageID, id: callId, delta: event.delta ?? '' });
        return;
      }
      case 'toolcall_end': {
        const call = event.toolCall;
        if (!call) return;
        toolOwners.set(call.id, messageID);
        if (!startedTools.has(call.id)) {
          startedTools.add(call.id);
          send('session.tool.input.started', {
            assistantMessageID: messageID,
            id: call.id,
            name: call.name,
          });
        }
        send('session.tool.input.ended', {
          assistantMessageID: messageID,
          id: call.id,
          text: JSON.stringify(call.arguments ?? {}),
        });
        return;
      }
      case 'error':
        failed = event.error ?? event.reason ?? 'The provider stopped';
        return;
      default:
        return;
    }
  };

  const push = (record) => {
    switch (record.kind) {
      case 'message-start':
        if (record.message.role === 'assistant') beginStep(record.message);
        return;
      case 'message-update':
        handleDelta(record.event);
        return;
      case 'message-end': {
        const message = record.message;
        if (message.role !== 'assistant') return;
        closeBlocks(message);
        endStep(message);
        if (message.stopReason === 'aborted') aborted = true;
        if (message.stopReason === 'error') failed = message.errorMessage ?? 'The provider stopped';
        messageID = null;
        return;
      }
      case 'tool-start': {
        const owner = toolOwners.get(record.toolCallId) ?? messageID;
        if (!owner) return;
        if (!startedTools.has(record.toolCallId)) {
          startedTools.add(record.toolCallId);
          toolOwners.set(record.toolCallId, owner);
          send('session.tool.input.started', {
            assistantMessageID: owner,
            id: record.toolCallId,
            name: record.toolName,
          });
        }
        send('session.tool.called', {
          assistantMessageID: owner,
          id: record.toolCallId,
          input: record.args,
          executed: true,
        });
        return;
      }
      case 'tool-update': {
        const owner = toolOwners.get(record.toolCallId);
        if (!owner) return;
        const output = contentText(record.content ?? '');
        if (!output) return;
        send('session.tool.progress', {
          assistantMessageID: owner,
          id: record.toolCallId,
          metadata: { output },
        });
        return;
      }
      case 'tool-end': {
        const owner = toolOwners.get(record.toolCallId);
        if (!owner) return;
        const output = contentText(record.content ?? '');
        if (record.isError) {
          const failed = {
            assistantMessageID: owner,
            id: record.toolCallId,
            error: { type: 'ToolError', message: output || 'The tool failed' },
            executed: true,
          };
          const content = output ? [{ type: 'text', text: output }] : null;
          if (content) failed.content = content;
          send('session.tool.failed', failed);
          return;
        }
        send('session.tool.success', {
          assistantMessageID: owner,
          id: record.toolCallId,
          content: [{ type: 'text', text: output }],
          executed: true,
        });
        return;
      }
      case 'settled': {
        const wasAborted = record.aborted || aborted;
        if (wasAborted) send('session.execution.interrupted', { reason: 'user' });
        else if (failed) send('session.execution.failed', { error: { type: 'ProviderError', message: failed } });
        else send('session.execution.succeeded', {});
        failed = null;
        aborted = false;
        messageID = null;
        stepOpen = false;
        return;
      }
      case 'compaction-start':
        send('session.compaction.started', { reason: record.reason === 'manual' ? 'manual' : 'auto' });
        return;
      case 'compaction-end':
        if (record.aborted) {
          send('session.compaction.failed', { error: { type: 'CompactionAborted', message: 'Compaction was aborted' } });
        } else if (record.error) {
          send('session.compaction.failed', { error: { type: 'CompactionError', message: record.error } });
        } else {
          send('session.compaction.ended', {});
        }
        return;
      case 'retry':
        send('session.status', {
          status: { type: 'retry', attempt: record.attempt, message: record.message },
        });
        return;
      default:
        return;
    }
  };

  return { push, currentAssistantMessageID: () => messageID };
};
