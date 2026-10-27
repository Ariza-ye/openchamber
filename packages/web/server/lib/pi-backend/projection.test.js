import { describe, expect, test } from 'bun:test';

import { projectSessionFileMessages, projectSessionTitle } from './projection.js';
import { parseSessionLine } from './schemas.js';

const line = (entry) => JSON.stringify(entry);

const header = (overrides = {}) => line({
  type: 'session',
  version: 3,
  id: 'ses_1',
  timestamp: '2026-01-01T00:00:00.000Z',
  cwd: '/repo',
  ...overrides,
});

const userEntry = (text, timestamp = 1000) => line({
  type: 'message',
  id: 'u1',
  parentId: null,
  timestamp: new Date(timestamp).toISOString(),
  message: { role: 'user', content: [{ type: 'text', text }], timestamp },
});

const assistantEntry = (content, { timestamp = 2000, stopReason = 'stop', id = 'a1', parentId = 'u1', usage } = {}) => {
  const message = { role: 'assistant', content, provider: 'magpie', model: 'auto/deepseek', stopReason, timestamp };
  if (usage) message.usage = usage;
  return line({
    type: 'message',
    id,
    parentId,
    timestamp: new Date(timestamp).toISOString(),
    message,
  });
};

const toolResultEntry = (callId, text, timestamp = 2500) => line({
  type: 'message',
  id: `tr_${callId}`,
  parentId: 'a1',
  timestamp: new Date(timestamp).toISOString(),
  message: {
    role: 'toolResult',
    toolCallId: callId,
    toolName: 'bash',
    content: [{ type: 'text', text }],
    isError: false,
    timestamp,
  },
});

const decode = (lines) => lines.map(parseSessionLine).filter((entry) => entry !== null);

describe('pi session projection', () => {
  test('projects a user and an assistant message in branch order', () => {
    const branch = decode([
      userEntry('hello'),
      assistantEntry([{ type: 'text', text: 'pong' }], { usage: { input: 5, output: 1, cost: { total: 0.1 } } }),
    ]);
    const messages = projectSessionFileMessages(branch);

    expect(messages.map((message) => message.type)).toEqual(['user', 'assistant']);
    expect(messages[0]).toMatchObject({ type: 'user', text: 'hello' });
    expect(messages[1]).toMatchObject({ type: 'assistant', finish: 'stop', model: { providerID: 'magpie', id: 'auto/deepseek' } });
    expect(messages[1].content).toEqual([{ type: 'text', text: 'pong' }]);
    expect(messages[1].tokens).toEqual({ input: 5, output: 1, reasoning: 0, cache: { read: 0, write: 0 } });
    expect(messages[1].cost).toBe(0.1);
  });

  test('folds a tool result into the tool part that called it', () => {
    const branch = decode([
      userEntry('run it'),
      assistantEntry([{ type: 'toolCall', id: 'call_1', name: 'bash', arguments: { command: 'ls' } }], { stopReason: 'toolUse' }),
      toolResultEntry('call_1', 'file.txt'),
    ]);
    const messages = projectSessionFileMessages(branch);
    const tool = messages[1].content[0];

    expect(tool.type).toBe('tool');
    expect(tool.state).toMatchObject({ status: 'completed', input: { command: 'ls' } });
    expect(tool.state.content).toEqual([{ type: 'text', text: 'file.txt' }]);
  });

  test('marks an errored tool result as an error state', () => {
    const branch = decode([
      userEntry('run it'),
      assistantEntry([{ type: 'toolCall', id: 'call_2', name: 'bash', arguments: {} }], { stopReason: 'toolUse' }),
      line({
        type: 'message',
        id: 'tr',
        parentId: 'a1',
        timestamp: '2026-01-01T00:00:03.000Z',
        message: {
          role: 'toolResult',
          toolCallId: 'call_2',
          toolName: 'bash',
          content: [{ type: 'text', text: 'boom' }],
          isError: true,
          timestamp: 3000,
        },
      }),
    ]);
    const tool = projectSessionFileMessages(branch)[1].content[0];
    expect(tool.state.status).toBe('error');
    expect(tool.state.error.message).toBe('boom');
  });

  test('reports a failed assistant turn with the provider error', () => {
    const branch = decode([
      userEntry('hello'),
      line({
        type: 'message',
        id: 'a1',
        parentId: 'u1',
        timestamp: '2026-01-01T00:00:02.000Z',
        message: {
          role: 'assistant',
          content: [],
          stopReason: 'error',
          errorMessage: 'rate limited',
          timestamp: 2000,
        },
      }),
    ]);
    const message = projectSessionFileMessages(branch)[1];
    expect(message.finish).toBe('error');
    expect(message.error).toEqual({ type: 'ProviderError', message: 'rate limited' });
  });

  test('titles a session by its session_info name, else its first user line', () => {
    const named = decode([
      userEntry('hello'),
      line({ type: 'session_info', id: 'n1', parentId: 'u1', timestamp: '2026-01-01T00:00:03.000Z', name: 'My work' }),
    ]);
    expect(projectSessionTitle(named)).toBe('My work');

    const titled = decode([userEntry('first line\nsecond line')]);
    expect(projectSessionTitle(titled)).toBe('first line');
  });

  test('skips a malformed line and keeps the rest of the session', () => {
    const branch = decode([
      userEntry('hello'),
      '{not json',
      assistantEntry([{ type: 'text', text: 'pong' }]),
    ]);
    expect(projectSessionFileMessages(branch)).toHaveLength(2);
  });

  test('ignores the session header line', () => {
    const decoded = parseSessionLine(header());
    expect(decoded?.kind).toBe('header');
    expect(decoded?.header.id).toBe('ses_1');
  });
});
