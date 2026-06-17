import React from 'react';
import {act, cleanup, render, screen} from '@testing-library/react';

import {useVisualPlaybackBeat} from '../src/hooks/useVisualPlaybackBeat';
import {useDAWStore} from '../src/store/useDAWStore';

function resetTransportStore(): void {
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    playheadBeat: 0,
    playheadSeconds: 0,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    syncSource: 'ui',
    tempoMap: [],
  });
}

function Probe({maxBeat = 64}: {maxBeat?: number}) {
  const beat = useVisualPlaybackBeat(maxBeat);
  return <output data-testid="beat">{beat.toFixed(3)}</output>;
}

describe('useVisualPlaybackBeat', () => {
  let nowMs = 1000;
  let frameCallback: FrameRequestCallback | null = null;
  let performanceNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    resetTransportStore();
    nowMs = 1000;
    frameCallback = null;
    performanceNowSpy = jest.spyOn(performance, 'now').mockImplementation(() => nowMs);
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = jest.fn() as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    cleanup();
    performanceNowSpy.mockRestore();
  });

  function runFrame(): void {
    const callback = frameCallback;
    frameCallback = null;
    act(() => {
      callback?.(nowMs);
    });
  }

  it('does not extrapolate from the UI play command before an engine tick arrives', () => {
    render(<Probe />);

    act(() => {
      useDAWStore.setState({
        isPlaying: true,
        playheadBeat: 4,
        playheadSeconds: 2,
        playheadOwnedByUser: false,
        syncSource: 'ui',
      });
    });

    nowMs = 1500;
    runFrame();

    expect(screen.getByTestId('beat')).toHaveTextContent('4.000');
  });

  it('interpolates visually from engine transport ticks without mutating the store beat', () => {
    render(<Probe />);

    act(() => {
      useDAWStore.setState({
        isPlaying: true,
        playheadBeat: 1,
        playheadSeconds: 0.5,
        playheadOwnedByUser: false,
        syncSource: 'engine',
      });
    });

    nowMs = 1050;
    runFrame();

    expect(screen.getByTestId('beat')).toHaveTextContent('1.100');
    expect(useDAWStore.getState().playheadBeat).toBe(1);
  });

  it('caps visual interpolation when engine transport ticks go stale', () => {
    render(<Probe />);

    act(() => {
      useDAWStore.setState({
        isPlaying: true,
        playheadBeat: 1,
        playheadSeconds: 0.5,
        playheadOwnedByUser: false,
        syncSource: 'engine',
      });
    });

    nowMs = 1500;
    runFrame();

    expect(screen.getByTestId('beat')).toHaveTextContent('1.200');
    expect(useDAWStore.getState().playheadBeat).toBe(1);
  });

  it('does not interpolate engine ticks while native play handoff is pending', () => {
    render(<Probe />);

    act(() => {
      useDAWStore.setState({
        isPlaying: true,
        playheadBeat: 1,
        playheadSeconds: 0.5,
        playheadOwnedByUser: false,
        playAwaitingEngine: true,
        syncSource: 'engine',
      });
    });

    nowMs = 1250;
    runFrame();

    expect(screen.getByTestId('beat')).toHaveTextContent('1.000');
  });
});
