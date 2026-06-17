import React from 'react';
import {cleanup, fireEvent, render} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
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
    snapGrid: DEFAULT_SNAP_GRID,
    isRelativeSnapEnabled: false,
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

test('ruler pointer placement keeps fractional playhead beats', () => {
  const {container} = render(<App />);
  const ruler = container.querySelector('.ruler-row') as HTMLDivElement;
  ruler.getBoundingClientRect = () => ({
    left: 100,
    top: 0,
    right: 100 + 64 * PIXELS_PER_BEAT,
    bottom: 28,
    width: 64 * PIXELS_PER_BEAT,
    height: 28,
    x: 100,
    y: 0,
    toJSON: () => ({}),
  });

  fireEvent.pointerDown(ruler, {
    button: 0,
    pointerId: 1,
    clientX: 100 + 2.37 * PIXELS_PER_BEAT,
  });

  expect(useDAWStore.getState().playheadBeat).toBeCloseTo(2.37);
});
