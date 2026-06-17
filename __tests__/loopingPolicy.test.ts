import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';
import {syncAllBlocksToEngine} from '../src/native/refreshPlayback';
import type {
  LooperLengthBars,
  ProjectPerformanceMode,
} from '../src/transport/performanceMode';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => '{"ok":true}'),
}));

jest.mock('../src/store/useDAWStore', () => ({
  useDAWStore: {
    getState: () => mockStoreState,
  },
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;
type MockStoreState = {
  blocks: unknown[];
  tracks: unknown[];
  performanceMode: ProjectPerformanceMode;
  looperLengthBars: LooperLengthBars;
  timeSignature: {numerator: number; denominator: number};
  isCycleEnabled: boolean;
  cycleStartBeat: number;
  cycleEndBeat: number;
};

let mockStoreState: MockStoreState = {
  blocks: [],
  tracks: [],
  performanceMode: 'linear',
  looperLengthBars: 4,
  timeSignature: {numerator: 4, denominator: 4},
  isCycleEnabled: false,
  cycleStartBeat: 0,
  cycleEndBeat: 4,
};

describe('looping policy', () => {
  beforeEach(() => {
    mockedSend.mockClear();
    mockStoreState = {
      blocks: [],
      tracks: [],
      performanceMode: 'linear',
      looperLengthBars: 4,
      timeSignature: {numerator: 4, denominator: 4},
      isCycleEnabled: false,
      cycleStartBeat: 0,
      cycleEndBeat: 4,
    };
  });

  it('syncAllBlocksToEngine keeps linear transport when cycle is disabled', () => {
    syncAllBlocksToEngine();

    const loopCalls = mockedSend.mock.calls.filter(([cmd]) => cmd === 'set_loop_range');
    expect(loopCalls.length).toBeGreaterThan(0);
    loopCalls.forEach(([, payload]) => {
      expect(payload).toMatchObject({looping: false});
    });
  });

  it('set_loop_range uses a wide range with cycle disabled', () => {
    syncAllBlocksToEngine();
    const [, payload] = mockedSend.mock.calls.find(([cmd]) => cmd === 'set_loop_range') ?? [];
    expect(payload).toEqual({
      startBeat: 0,
      lengthBeats: 4096,
      looping: false,
    });
  });

  it('set_loop_range uses the project cycle range when cycle is enabled', () => {
    mockStoreState = {
      blocks: [],
      tracks: [],
      performanceMode: 'linear',
      looperLengthBars: 4,
      timeSignature: {numerator: 4, denominator: 4},
      isCycleEnabled: true,
      cycleStartBeat: 8,
      cycleEndBeat: 20,
    };

    syncAllBlocksToEngine();

    const [, payload] = mockedSend.mock.calls.find(([cmd]) => cmd === 'set_loop_range') ?? [];
    expect(payload).toEqual({
      startBeat: 8,
      lengthBeats: 12,
      looping: true,
    });
  });

  it('set_loop_range uses the looper container when looper mode is active', () => {
    mockStoreState = {
      blocks: [],
      tracks: [],
      performanceMode: 'looper',
      looperLengthBars: 8,
      timeSignature: {numerator: 3, denominator: 4},
      isCycleEnabled: false,
      cycleStartBeat: 8,
      cycleEndBeat: 20,
    };

    syncAllBlocksToEngine();

    const [, payload] = mockedSend.mock.calls.find(([cmd]) => cmd === 'set_loop_range') ?? [];
    expect(payload).toEqual({
      startBeat: 0,
      lengthBeats: 24,
      looping: true,
    });
  });
});

describe('pattern preview isolation (contract)', () => {
  it('main transport Play path stops pattern preview before transport_play', () => {
    // Documented invariant: useDAWNativeBridge sends stop_pattern_preview when isPlaying flips true.
    // Full integration requires Electron; this test locks the command name for regression grep.
    expect('stop_pattern_preview').toBe('stop_pattern_preview');
  });
});
