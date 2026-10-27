import { describe, expect, test } from 'vitest';

import { createPiEventTranslator } from './event-translator.js';

const collect = () => {
  const events = [];
  const translator = createPiEventTranslator({
    sessionID: 'ses_test',
    directory: '/repo',
    emit: (event) => events.push(event),
  });
  return { events, translator };
};

const assistant = (overrides = {}) => ({
  role: 'assistant',
  content: [{ type: 'text', text: 'pong' }],
  provider: 'magpie',
  model: 'auto/deepseek',
  usage: { input: 10, output: 2, cacheRead: 3, cacheWrite: 0, cost: { total: 0.42 } },
  stopReason: 'stop',
  timestamp: 1000,
  ...overrides,
});

describe('pi event translator', () => {
  test('opens a step before any text part and closes it with the final totals', () => {
    const { events, translator } = collect();
    translator.push({ kind: 'message-start', message: assistant({ content: [] }) });
    translator.push({ kind: 'message-update', event: { type: 'text_start', contentIndex: 0 } });
    translator.push({ kind: 'message-update', event: { type: 'text_delta', contentIndex: 0, delta: 'po' } });
    translator.push({ kind: 'message-end', message: assistant() });
    translator.push({ kind: 'settled', aborted: false });

    expect(events.map((event) => event.type)).toEqual([
      'session.step.started',
      'session.execution.started',
      'session.text.started',
      'session.text.delta',
      'session.text.ended',
      'session.step.ended',
      'session.execution.succeeded',
    ]);
    expect(events[0].data.assistantMessageID).toBeTruthy();
    expect(events[3].data.delta).toBe('po');
    expect(events[5].data.finish).toBe('stop');
    expect(events[5].data.tokens).toEqual({ input: 10, output: 2, reasoning: 0, cache: { read: 3, write: 0 } });
    expect(events[5].data.cost).toBe(0.42);
    expect(events[0].location.directory).toBe('/repo');
  });

  test('keeps the tool owner after the assistant message ended', () => {
    const { events, translator } = collect();
    translator.push({ kind: 'message-start', message: assistant({ content: [] }) });
    translator.push({
      kind: 'message-update',
      event: {
        type: 'toolcall_end',
        toolCall: { type: 'toolCall', id: 'call_1', name: 'bash', arguments: { command: 'ls' } },
      },
    });
    translator.push({
      kind: 'message-end',
      message: assistant({
        content: [{ type: 'toolCall', id: 'call_1', name: 'bash', arguments: { command: 'ls' } }],
        stopReason: 'toolUse',
      }),
    });
    translator.push({ kind: 'tool-start', toolCallId: 'call_1', toolName: 'bash', args: { command: 'ls' } });
    translator.push({ kind: 'tool-end', toolCallId: 'call_1', content: [{ type: 'text', text: 'ok' }], details: null, isError: false });

    const types = events.map((event) => event.type);
    expect(types).toContain('session.tool.called');
    expect(types).toContain('session.tool.success');
    const started = events.find((event) => event.type === 'session.step.started');
    const called = events.find((event) => event.type === 'session.tool.called');
    const success = events.find((event) => event.type === 'session.tool.success');
    expect(called.data.assistantMessageID).toBe(started.data.assistantMessageID);
    expect(success.data.assistantMessageID).toBe(started.data.assistantMessageID);
    expect(success.data.content).toEqual([{ type: 'text', text: 'ok' }]);
  });

  test('reports an aborted run as interrupted, not failed', () => {
    const { events, translator } = collect();
    translator.push({ kind: 'message-start', message: assistant({ content: [] }) });
    translator.push({ kind: 'message-end', message: assistant({ stopReason: 'aborted' }) });
    translator.push({ kind: 'settled', aborted: true });

    expect(events.map((event) => event.type)).toContain('session.step.failed');
    expect(events[events.length - 1]).toMatchObject({ type: 'session.execution.interrupted', data: { reason: 'user' } });
  });

  test('numbers text and reasoning blocks per kind', () => {
    const { events, translator } = collect();
    translator.push({ kind: 'message-start', message: assistant({ content: [] }) });
    translator.push({ kind: 'message-update', event: { type: 'thinking_start', contentIndex: 0 } });
    translator.push({ kind: 'message-update', event: { type: 'thinking_delta', contentIndex: 0, delta: 'hmm' } });
    translator.push({ kind: 'message-update', event: { type: 'text_start', contentIndex: 1 } });
    translator.push({ kind: 'message-update', event: { type: 'text_delta', contentIndex: 1, delta: 'hi' } });

    const reasoning = events.find((event) => event.type === 'session.reasoning.started');
    const text = events.find((event) => event.type === 'session.text.started');
    expect(reasoning.data.ordinal).toBe(0);
    expect(text.data.ordinal).toBe(0);
  });
});
