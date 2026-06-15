import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';

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

export async function main() {
  await runBuildStep('npm', ['run', 'build:engine']);
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
    const electronEnv = {...process.env, ELECTRON_RENDERER_URL: url};
    delete electronEnv.ELECTRON_RUN_AS_NODE;

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
