import { expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useUpdatePolling } from './useUpdatePolling';

async function verifyUpdatePolling(desktop: boolean) {
  const dom = new Window({ url: 'http://updates.test' });
  if (desktop) {
    Object.defineProperty(dom, '__OPENCHAMBER_ELECTRON__', { value: { runtime: 'electron' } });
  }
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const originalState = useUpdateStore.getState();
  let checks = 0;
  useUpdateStore.setState({ checkForUpdates: async () => { checks += 1; return null; } });
  const schedule = dom.setTimeout.bind(dom);
  const cancel = dom.clearTimeout.bind(dom);
  const timeout = spyOn(dom, 'setTimeout').mockImplementation(() => {
    const handle = schedule(() => undefined, 0);
    cancel(handle);
    return handle;
  });
  const clear = spyOn(dom, 'clearTimeout');
  const root = createRoot(document.createElement('div'));
  const Harness = () => { useUpdatePolling(); return null; };
  let unmounted = false;
  try {
    await act(async () => root.render(React.createElement(Harness)));
    expect(checks).toBe(0);
    expect(timeout.mock.calls.length).toBe(desktop ? 0 : 1);
    if (!desktop) {
      expect(timeout.mock.calls[0][1]).toBe(3000);
      await act(async () => { await timeout.mock.calls[0][0](); });
      expect(checks).toBe(1);
      expect(timeout.mock.calls.length).toBe(2);
      expect(timeout.mock.calls[1][1]).toBe(60 * 60 * 1000);
    }

    await useUpdateStore.getState().checkForUpdates();
    expect(checks).toBe(desktop ? 1 : 2);
    await act(async () => root.unmount());
    unmounted = true;
    expect(clear.mock.calls.length).toBe(desktop ? 0 : 1);
  } finally {
    if (!unmounted) await act(async () => root.unmount());
    timeout.mockRestore();
    clear.mockRestore();
    useUpdateStore.setState(originalState, true);
    await dom.happyDOM.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

test('Electron skips automatic checks and retains manual checks', () => verifyUpdatePolling(true));
test('web retains initial and recurring checks and cleans up on unmount', () => verifyUpdatePolling(false));
