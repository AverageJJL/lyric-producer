import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';

const serviceScript = 'electron/scripts/collaboration-service.mjs';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function spawnService(env) {
  const child = spawn(process.execPath, [serviceScript], {
    cwd: process.cwd(),
    env: {...process.env, ...env},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  return {child, output: () => ({stdout, stderr})};
}

function waitForExit(child) {
  return new Promise(resolve => {
    child.on('exit', code => resolve(code));
  });
}

function getHealth(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      host: '127.0.0.1',
      port,
      path: '/health',
      timeout: 1000,
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try {
          resolve({headers: response.headers, json: JSON.parse(body), status: response.statusCode});
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error('health timeout'));
    });
  });
}

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await getHealth(port);
    } catch {
      await new Promise(resolve => { setTimeout(resolve, 50); });
    }
  }
  throw new Error('collaboration service did not become healthy');
}

function websocketHandshake({origin, peer = 'peer-1', port, token = 'secret'}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({host: '127.0.0.1', port}, () => {
      const key = crypto.randomBytes(16).toString('base64');
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      socket.write([
        `GET /?room=Dark%20Room&peer=${encodeURIComponent(peer)}${tokenParam} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Version: 13',
        `Sec-WebSocket-Key: ${key}`,
        `Origin: ${origin}`,
        '\r\n',
      ].join('\r\n'));
    });
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }
      socket.removeAllListeners('data');
      const header = buffer.subarray(0, headerEnd).toString('utf8');
      const match = /^HTTP\/1\.1 (\d+)/.exec(header);
      resolve({
        header,
        rest: buffer.subarray(headerEnd + 4),
        socket,
        status: match ? Number.parseInt(match[1], 10) : 0,
      });
    });
    socket.on('error', reject);
  });
}

function readServerText(socket, initial) {
  return new Promise((resolve, reject) => {
    let buffer = initial;
    const timeout = setTimeout(() => reject(new Error('server frame timeout')), 1000);
    const tryRead = () => {
      if (buffer.length < 2) {
        return;
      }
      let length = buffer[1] & 0x7f;
      let cursor = 2;
      if (length === 126) {
        if (buffer.length < 4) {
          return;
        }
        length = buffer.readUInt16BE(2);
        cursor = 4;
      }
      if (buffer.length < cursor + length) {
        return;
      }
      clearTimeout(timeout);
      socket.removeAllListeners('data');
      resolve(buffer.subarray(cursor, cursor + length).toString('utf8'));
    };
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      tryRead();
    });
    socket.on('error', reject);
    tryRead();
  });
}

async function assertBadProductionConfigFails() {
  const {child, output} = spawnService({
    COLLAB_DEPLOYMENT_MODE: 'production',
    COLLAB_PORT: String(await freePort()),
    COLLAB_TOKENS: '',
    COLLAB_ALLOWED_ORIGINS: '',
  });
  const code = await waitForExit(child);
  assert.notEqual(code, 0);
  assert.match(output().stderr, /COLLAB_TOKENS/);
  assert.match(output().stderr, /COLLAB_ALLOWED_ORIGINS/);
}

async function assertHostedServicePolicy() {
  const port = await freePort();
  const service = spawnService({
    COLLAB_DEPLOYMENT_MODE: 'production',
    COLLAB_ALLOWED_ORIGINS: 'https://studio.example,file://',
    COLLAB_HOST: '127.0.0.1',
    COLLAB_MAX_MESSAGE_BYTES: '2048',
    COLLAB_PORT: String(port),
    COLLAB_TOKENS: 'secret',
  });
  try {
    const health = await waitForHealth(port);
    assert.equal(health.status, 200);
    assert.equal(health.headers['x-content-type-options'], 'nosniff');
    assert.equal(health.json.tokenRequired, true);
    assert.equal(health.json.deployment.hosted, true);
    assert.equal(health.json.deployment.originPolicy, 'restricted');
    assert.deepEqual(health.json.deployment.allowedOrigins, ['https://studio.example', 'file://']);

    const badOrigin = await websocketHandshake({origin: 'https://evil.example', port});
    assert.equal(badOrigin.status, 403);
    badOrigin.socket.destroy();

    const noToken = await websocketHandshake({origin: 'https://studio.example', port, token: ''});
    assert.equal(noToken.status, 401);
    noToken.socket.destroy();

    const accepted = await websocketHandshake({origin: 'https://studio.example', port});
    assert.equal(accepted.status, 101);
    const text = await readServerText(accepted.socket, accepted.rest);
    assert.deepEqual(JSON.parse(text), {
      type: 'room_state',
      snapshot: {
        roomId: 'dark-room',
        peerIds: ['peer-1'],
        presences: [],
        operations: [],
      },
    });
    accepted.socket.end();
  } finally {
    service.child.kill('SIGTERM');
    await waitForExit(service.child);
  }
}

await assertBadProductionConfigFails();
await assertHostedServicePolicy();
