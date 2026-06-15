import {performance} from 'node:perf_hooks';

export const SLOW_NATIVE_IPC_MS = 16;

type NativeIpcLogger = Pick<typeof console, 'log' | 'warn'>;

type NativeIpcTraceOptions = {
  command: string;
  payloadJson: string;
  isPackaged: boolean;
  invoke: () => string;
  env?: NodeJS.ProcessEnv;
  logger?: NativeIpcLogger;
  now?: () => number;
};

export type NativeIpcTraceDecision = {
  traceEveryCommand: boolean;
  warnSlowCommand: boolean;
};

export function nativeIpcTraceDecision(
  env: NodeJS.ProcessEnv,
  isPackaged: boolean,
  durationMs: number,
): NativeIpcTraceDecision {
  const traceEveryCommand = env.AI_PRODUCER_IPC_TRACE === '1';
  return {
    traceEveryCommand,
    warnSlowCommand: durationMs >= SLOW_NATIVE_IPC_MS && (!isPackaged || traceEveryCommand),
  };
}

export function nativeIpcTraceMessage(input: {
  command: string;
  durationMs: number;
  payloadJson: string;
  responseJson: string;
  failed: boolean;
}): string {
  const status = input.failed ? ' failed' : '';
  return [
    `[native-ipc${status}]`,
    input.command,
    `${input.durationMs.toFixed(1)}ms`,
    `payload=${Buffer.byteLength(input.payloadJson, 'utf8')}B`,
    `response=${Buffer.byteLength(input.responseJson, 'utf8')}B`,
  ].join(' ');
}

export function runNativeIpcWithTrace(options: NativeIpcTraceOptions): string {
  const logger = options.logger ?? console;
  const env = options.env ?? process.env;
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  let responseJson = '';
  let failed = false;

  try {
    responseJson = options.invoke();
    return responseJson;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const durationMs = Math.max(0, now() - startedAt);
    const decision = nativeIpcTraceDecision(env, options.isPackaged, durationMs);
    if (decision.warnSlowCommand || decision.traceEveryCommand) {
      const message = nativeIpcTraceMessage({
        command: options.command,
        durationMs,
        payloadJson: options.payloadJson,
        responseJson,
        failed,
      });
      if (decision.warnSlowCommand) {
        logger.warn(message);
      } else {
        logger.log(message);
      }
    }
  }
}
