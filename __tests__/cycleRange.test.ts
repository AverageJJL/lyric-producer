import {buildNativeLoopRangePayload} from '../src/native/loopRangePayload';
import {normalizeCycleRange} from '../src/transport/cycleRange';

describe('cycle range helpers', () => {
  it('normalizes invalid ranges to at least one beat', () => {
    expect(normalizeCycleRange(8, 4)).toEqual({startBeat: 3, endBeat: 4});
    expect(normalizeCycleRange(2, 2)).toEqual({startBeat: 2, endBeat: 3});
  });

  it('builds disabled and enabled native loop payloads', () => {
    expect(buildNativeLoopRangePayload({isCycleEnabled: false})).toEqual({
      startBeat: 0,
      lengthBeats: 4096,
      looping: false,
    });
    expect(buildNativeLoopRangePayload({
      isCycleEnabled: true,
      cycleStartBeat: 4,
      cycleEndBeat: 12,
    })).toEqual({
      startBeat: 4,
      lengthBeats: 8,
      looping: true,
    });
  });

  it('looper mode overrides cycle locators with a circular 4 or 8 bar range', () => {
    expect(buildNativeLoopRangePayload({
      performanceMode: 'looper',
      looperLengthBars: 4,
      timeSignature: {numerator: 3, denominator: 4},
      isCycleEnabled: true,
      cycleStartBeat: 8,
      cycleEndBeat: 20,
    })).toEqual({
      startBeat: 0,
      lengthBeats: 12,
      looping: true,
    });
    expect(buildNativeLoopRangePayload({
      performanceMode: 'looper',
      looperLengthBars: 8,
      timeSignature: {numerator: 7, denominator: 8},
    })).toEqual({
      startBeat: 0,
      lengthBeats: 28,
      looping: true,
    });
  });
});
