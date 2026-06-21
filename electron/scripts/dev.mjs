import {spawn} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createServer} from 'vite';

const require = createRequire(import.meta.url);
const {nativeAddonFreshness} = require('./native-dev-build-cache.cjs');

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
const localEnvPath = fileURLToPath(new URL('../../.env.local', import.meta.url));

function runBuildStep(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`));
    });
  });
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    const unquoted = trimmed.slice(1, -1);
    return quote === '"'
      ? unquoted.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
      : unquoted;
  }
  return trimmed.replace(/\s+#.*$/, '').trim();
}

export function parseEnvFile(contents) {
  const parsed = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      parsed[match[1]] = unquoteEnvValue(match[2]);
    }
  }
  return parsed;
}

export function loadLocalElectronEnv(envPath = localEnvPath) {
  if (!existsSync(envPath)) {
    return {};
  }
  return parseEnvFile(readFileSync(envPath, 'utf8'));
}

export function loadElectronEnv(envPaths = [envPath, localEnvPath]) {
  return envPaths.reduce(
    (env, currentPath) => ({...env, ...loadLocalElectronEnv(currentPath)}),
    {},
  );
}

export function electronDevEnv(url, baseEnv = process.env, localEnv = loadElectronEnv()) {
  // Load local env files into Electron main only. Vite does not receive this
  // map, so local API keys are not injected into the renderer bundle. The
  // plain .env file gives users a familiar setup path, while .env.local can
  // still override it for machine-specific secrets.
  const electronEnv = {...localEnv, ...baseEnv, ELECTRON_RENDERER_URL: url};
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  return electronEnv;
}

export function vitePort() {
  const requested = Number(process.env.VITE_PORT ?? process.env.PORT ?? 5173);
  return Number.isFinite(requested) ? requested : 5173;
}

export function rendererUrl(server) {
  const urls = server.resolvedUrls?.local ?? [];
  const loopbackUrl =
    urls.find(url => url.startsWith('http://127.0.0.1')) ??
    urls.find(url => url.startsWith('http://localhost')) ??
    urls[0];

  if (!loopbackUrl) {
    throw new Error('Vite did not report a local renderer URL.');
  }

  return loopbackUrl;
}

export function shouldForceNativeBuild(
  argv = process.argv,
  env = process.env,
) {
  return argv.includes('--force-native-build') ||
    env.MUSICAPP_FORCE_NATIVE_BUILD === '1' ||
    env.FORCE_NATIVE_BUILD === '1';
}

export function shouldSkipNativeBuild(
  argv = process.argv,
  env = process.env,
) {
  return argv.includes('--skip-native-build') ||
    env.MUSICAPP_SKIP_NATIVE_BUILD === '1' ||
    env.SKIP_NATIVE_BUILD === '1';
}

export async function buildNativeForDevIfNeeded({
  force = shouldForceNativeBuild(),
  skip = shouldSkipNativeBuild(),
  freshness = nativeAddonFreshness(repoRoot),
} = {}) {
  if (skip && !force && freshness.reason !== 'missing') {
    console.log('Skipping native addon rebuild by request.');
    return;
  }

  if (skip && !force) {
    console.log('Native addon missing; ignoring skip request and running build:engine.');
  }

  if (!force && freshness.fresh) {
    console.log('Native addon is up to date; skipping build:engine.');
    return;
  }

  if (force) {
    console.log('Forcing native addon rebuild for dev.');
  } else if (freshness.reason === 'missing') {
    console.log('Native addon missing; running build:engine.');
  } else if (freshness.newestInputPath) {
    console.log(`Native addon stale after ${freshness.newestInputPath}; running build:engine.`);
  }

  await runBuildStep('npm', ['run', 'build:engine']);
}

export async function main() {
  await buildNativeForDevIfNeeded();
  await runBuildStep('npm', ['run', 'build:electron']);

  let viteServer;
  let electronProcess;
  let isShuttingDown = false;

  const shutdown = async (exitCode = 0) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    if (electronProcess && !electronProcess.killed) {
      electronProcess.kill();
    }

    await viteServer?.close();
    process.exit(exitCode);
  };

  try {
    viteServer = await createServer({
      server: {
        host: '127.0.0.1',
        port: vitePort(),
        strictPort: false,
      },
    });
    await viteServer.listen();
    viteServer.printUrls();

    const url = rendererUrl(viteServer);
    console.log(`Launching Electron renderer at ${url}`);

    // Cursor/CI sometimes sets ELECTRON_RUN_AS_NODE=1, which makes require('electron')
    // return the binary path instead of main-process APIs (ipcMain undefined).
    const electronEnv = electronDevEnv(url);

    electronProcess = spawn('npx', ['electron', '.'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: electronEnv,
    });

    process.once('SIGINT', () => void shutdown(130));
    process.once('SIGTERM', () => void shutdown(143));
    electronProcess.on('error', error => {
      console.error(error);
      void shutdown(1);
    });
    electronProcess.on('exit', code => void shutdown(code ?? 0));
  } catch (error) {
    await viteServer?.close();
    throw error;
  }
}

const isCliEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCliEntry) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
