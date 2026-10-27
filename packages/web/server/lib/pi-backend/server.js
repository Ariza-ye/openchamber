/**
 * The pi backend as a loopback HTTP server.
 *
 * Pichamber's proxy, event hub and health check all speak HTTP to one
 * address. Serving the adapter on a loopback port and pointing `openCodePort`
 * at it makes "run on pi" a swap of the backend instead of a second code path
 * through the UI.
 *
 * The listener binds `127.0.0.1` on port 0: the OS picks the port, so two
 * instances never fight over it, and nothing outside the machine can reach it.
 */
import http from 'node:http';

import { createPiApiApp } from './api-app.js';
import { createPiRuntime } from './runtime.js';

export const startPiBackend = async ({
  express,
  binary,
  env,
  agentDir,
  log = console,
}) => {
  const runtime = createPiRuntime({ binary, env, log });
  const app = createPiApiApp({ express, runtime, agentDir, binary, env, log });

  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || !('port' in address)) {
        reject(new Error('The pi backend listener has no port'));
        return;
      }
      resolve(address.port);
    });
  });

  log.log(`[pi] backend listening on 127.0.0.1:${port}`);

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await runtime.closeAll();
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    },
  };
};
