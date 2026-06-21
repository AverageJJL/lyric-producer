import {
  nativeIpcTraceDecision,
  runNativeIpcWithTrace,
  runNativeIpcWithTraceAsync,
  SLOW_NATIVE_IPC_MS,
} from '../electron/nativeIpcTrace';

describe('native IPC tracing', () => {
  it('logs every command when explicit tracing is enabled', () => {
    const logger = {log: jest.fn(), warn: jest.fn()};
    const nowValues = [10, 15];
    const response = runNativeIpcWithTrace({
      command: 'engine_status',
      payloadJson: '{}',
      isPackaged: true,
      env: {AI_PRODUCER_IPC_TRACE: '1'},
      logger,
      now: () => nowValues.shift() ?? 15,
      invoke: () => '{"ok":true}',
    });

    expect(response).toBe('{"ok":true}');
    expect(logger.log).toHaveBeenCalledWith(
      '[native-ipc] engine_status 5.0ms payload=2B response=11B',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns on slow dev commands without enabling packaged noise', () => {
    expect(nativeIpcTraceDecision({}, false, SLOW_NATIVE_IPC_MS)).toEqual({
      traceEveryCommand: false,
      warnSlowCommand: true,
    });
    expect(nativeIpcTraceDecision({}, true, SLOW_NATIVE_IPC_MS)).toEqual({
      traceEveryCommand: false,
      warnSlowCommand: false,
    });
  });

  it('traces async native commands after the promise resolves', async () => {
    const logger = {log: jest.fn(), warn: jest.fn()};
    const nowValues = [10, 30];
    const response = await runNativeIpcWithTraceAsync({
      command: 'analyze_audio_file',
      payloadJson: '{"absoluteAudioFilePath":"/tmp/song.mp3"}',
      isPackaged: false,
      env: {},
      logger,
      now: () => nowValues.shift() ?? 30,
      invoke: async () => '{"ok":true}',
    });

    expect(response).toBe('{"ok":true}');
    expect(logger.warn).toHaveBeenCalledWith(
      '[native-ipc] analyze_audio_file 20.0ms payload=41B response=11B',
    );
    expect(logger.log).not.toHaveBeenCalled();
  });
});
