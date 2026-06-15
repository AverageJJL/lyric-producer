import http from 'node:http';
import {createServer as createViteServer} from 'vite';

import {rendererUrl, vitePort} from './dev.mjs';

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise(resolve => {
    server.close(() => resolve());
  });
}

const occupiedPort = vitePort();
const occupiedServer = http.createServer((_request, response) => {
  response.writeHead(200, {'Content-Type': 'text/plain'});
  response.end('occupied');
});

let viteServer;
let ownsOccupiedPort = false;

try {
  try {
    await listen(occupiedServer, occupiedPort);
    ownsOccupiedPort = true;
  } catch (error) {
    if (error?.code !== 'EADDRINUSE') {
      throw error;
    }
  }

  viteServer = await createViteServer({
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port: occupiedPort,
      strictPort: false,
    },
  });
  await viteServer.listen();

  const url = rendererUrl(viteServer);
  const resolvedPort = Number(new URL(url).port);
  if (resolvedPort === occupiedPort) {
    throw new Error(`Expected Vite to avoid occupied port ${occupiedPort}; got ${url}`);
  }

  console.log(`Resolved fallback renderer URL: ${url}`);
} finally {
  await viteServer?.close();
  if (ownsOccupiedPort) {
    await close(occupiedServer);
  }
}
