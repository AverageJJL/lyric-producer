import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';

function startServer() {
  const server = http.createServer((request, response) => {
    if (request.url === '/crash-health') {
      response.writeHead(200, {'content-type': 'application/json'});
      response.end(JSON.stringify({ok: true}));
      return;
    }
    if (request.url === '/updates/latest.yml') {
      response.writeHead(200, {'content-type': 'text/yaml'});
      response.end('version: 1.2.3\nfiles:\n  - url: AIProducerCore.exe\n    sha512: fake\n');
      return;
    }
    if (request.url === '/updates/latest-mac.yml') {
      response.writeHead(200, {'content-type': 'text/yaml'});
      response.end('version: 1.2.3\nfiles:\n  - url: AIProducerCore.zip\n    sha512: fake\n');
      return;
    }
    response.writeHead(404);
    response.end();
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        close: () => new Promise(done => server.close(done)),
        port: typeof address === 'object' && address ? address.port : 0,
      });
    });
  });
}

function runValidator(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['electron/scripts/validate-release-services.mjs', '--strict'],
      {cwd: process.cwd(), env: {...process.env, ...env}},
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`validator exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

const server = await startServer();
try {
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const output = await runValidator({
    AI_PRODUCER_CRASH_HEALTH_URL: `${baseUrl}/crash-health`,
    AI_PRODUCER_CRASH_UPLOAD_URL: `${baseUrl}/crash`,
    AI_PRODUCER_UPDATE_FEED_URL: `${baseUrl}/updates`,
    RELEASE_SERVICE_ALLOW_HTTP: '1',
  });
  assert.match(output, /Hosted release service validation passed in strict mode/);
} finally {
  await server.close();
}
