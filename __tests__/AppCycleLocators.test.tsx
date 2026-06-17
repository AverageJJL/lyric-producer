import React from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {PIXELS_PER_BEAT} from '../src/ui/timelineLayout';
import {App} from '../src/web/App';

const sendCommand = jest.fn();

function resetStore(): void {
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [],
    patterns: {},
    blocks: [],
    masterVolumeDb: 0,
    masterPan: 0,
    isRelativeSnapEnabled: false,
    isCycleEnabled: false,
    cycleStartBeat: 0,
    cycleEndBeat: 4,
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    isRecording: false,
    recordingBlockId: null,
    recordingStartSeconds: null,
    recordingWallClockStart: null,
    recordingError: null,
    playheadBeat: 0,
    playheadSeconds: 0,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    playStartSeconds: 0,
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    midiAudition: null,
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

beforeEach(() => {
  resetStore();
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({ok: true, data: {deviceName: 'Mock Output', sampleRate: 48000}});
    }
    return JSON.stringify({ok: true, data: {}});
  });
  window.audioEngine = {sendCommand, onEvent: () => () => undefined};
  window.PointerEvent =
    window.PointerEvent ??
    (class MockPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, props: PointerEventInit = {}) {
        super(type, props);
        this.pointerId = props.pointerId ?? 0;
      }
    } as typeof PointerEvent);
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
});

test('toggles cycle playback from the transport', () => {
  render(<App />);
  sendCommand.mockClear();

  fireEvent.click(screen.getByRole('button', {name: 'Cycle playback'}));

  expect(useDAWStore.getState().isCycleEnabled).toBe(true);
  expect(sendCommand).toHaveBeenCalledWith(
    'set_loop_range',
    JSON.stringify({startBeat: 0, lengthBeats: 4, looping: true}),
  );
});

function setCycleLayerRect(left = 100): HTMLDivElement {
  const layer = document.querySelector('.cycle-locator-layer') as HTMLDivElement;
  layer.getBoundingClientRect = () => ({
    left,
    top: 0,
    right: left + 64 * PIXELS_PER_BEAT,
    bottom: 28,
    width: 64 * PIXELS_PER_BEAT,
    height: 28,
    x: left,
    y: 0,
    toJSON: () => ({}),
  });
  return layer;
}

test('drags cycle locator handles on the timeline ruler', () => {
  render(<App />);
  const layer = setCycleLayerRect();
  const endHandle = screen.getByLabelText('Cycle end locator');

  fireEvent.pointerDown(endHandle, {
    button: 0,
    pointerId: 1,
    clientX: 100 + 4 * PIXELS_PER_BEAT,
  });
  fireEvent.pointerMove(layer, {
    pointerId: 1,
    clientX: 100 + 8.2 * PIXELS_PER_BEAT,
  });
  fireEvent.pointerUp(layer, {
    pointerId: 1,
    clientX: 100 + 8.2 * PIXELS_PER_BEAT,
  });

  expect(useDAWStore.getState()).toMatchObject({
    isCycleEnabled: true,
    cycleStartBeat: 0,
    cycleEndBeat: 8,
  });
  expect(screen.getByLabelText('Cycle range')).toHaveTextContent('001-009');
});
