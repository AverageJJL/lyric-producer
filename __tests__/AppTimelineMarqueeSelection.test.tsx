import React from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {PIXELS_PER_BEAT, ROW_HEIGHT} from '../src/ui/timelineLayout';
import {App} from '../src/web/App';

const sendCommand = jest.fn();

const tracks: DAWTrack[] = ['track-1', 'track-2'].map((id, index) => ({
  id,
  name: `Track ${index + 1}`,
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isRecordArmed: false,
  isLocked: false,
}));

function block(id: string, trackId: string, startBeat: number): DAWBlock {
  return {
    id,
    trackId,
    name: id,
    startBeat,
    lengthBeats: 4,
    type: 'midi',
    color: '#4a7fd4',
    notes: [],
  };
}

function resetStore(): void {
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks,
    patterns: {},
    blocks: [
      block('clip-a', 'track-1', 0),
      block('clip-b', 'track-2', 8),
    ],
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
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  window.localStorage.clear();
});

test('selects timeline clips with a marquee drag over rows', () => {
  render(<App />);
  const layer = screen.getByLabelText('Marquee selection area') as HTMLDivElement;
  layer.getBoundingClientRect = () => ({
    left: 100,
    top: 200,
    right: 100 + 64 * PIXELS_PER_BEAT,
    bottom: 200 + ROW_HEIGHT * 2,
    width: 64 * PIXELS_PER_BEAT,
    height: ROW_HEIGHT * 2,
    x: 100,
    y: 200,
    toJSON: () => ({}),
  });

  const row = screen.getByRole('button', {name: 'Timeline row 1'});
  fireEvent.pointerDown(row, {
    button: 0,
    pointerId: 1,
    clientX: 100 + 0.5 * PIXELS_PER_BEAT,
    clientY: 210,
  });
  fireEvent.pointerMove(row, {
    pointerId: 1,
    clientX: 100 + 5 * PIXELS_PER_BEAT,
    clientY: 200 + ROW_HEIGHT - 4,
  });
  fireEvent.pointerUp(row, {
    pointerId: 1,
    clientX: 100 + 5 * PIXELS_PER_BEAT,
    clientY: 200 + ROW_HEIGHT - 4,
  });

  expect(useDAWStore.getState()).toMatchObject({
    selectedBlockId: 'clip-a',
    selectedBlockIds: ['clip-a'],
    selectedTrackId: 'track-1',
  });
});

test('selects clips on variable-height timeline rows', () => {
  useDAWStore.setState({
    tracks: [{...tracks[0]!, trackHeightScale: 1.5}, tracks[1]!],
  });
  render(<App />);
  const layer = screen.getByLabelText('Marquee selection area') as HTMLDivElement;
  const rowAreaHeight = ROW_HEIGHT * 1.5 + ROW_HEIGHT;
  layer.getBoundingClientRect = () => ({
    left: 100,
    top: 200,
    right: 100 + 64 * PIXELS_PER_BEAT,
    bottom: 200 + rowAreaHeight,
    width: 64 * PIXELS_PER_BEAT,
    height: rowAreaHeight,
    x: 100,
    y: 200,
    toJSON: () => ({}),
  });

  const secondRowY = 200 + ROW_HEIGHT * 1.5 + 10;
  const row = screen.getByRole('button', {name: 'Timeline row 2'});
  fireEvent.pointerDown(row, {
    button: 0,
    pointerId: 2,
    clientX: 100 + 8.5 * PIXELS_PER_BEAT,
    clientY: secondRowY,
  });
  fireEvent.pointerMove(row, {
    pointerId: 2,
    clientX: 100 + 12.5 * PIXELS_PER_BEAT,
    clientY: secondRowY + 12,
  });
  fireEvent.pointerUp(row, {
    pointerId: 2,
    clientX: 100 + 12.5 * PIXELS_PER_BEAT,
    clientY: secondRowY + 12,
  });

  expect(useDAWStore.getState()).toMatchObject({
    selectedBlockId: 'clip-b',
    selectedBlockIds: ['clip-b'],
    selectedTrackId: 'track-2',
  });
});
