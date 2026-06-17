import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWTrack} from '../src/store/useDAWStore';
import {ROW_HEIGHT, RULER_HEIGHT, TRACK_SIDEBAR_FOOTER_HEIGHT} from '../src/ui/timelineLayout';
import {App} from '../src/web/App';

const sendCommand = jest.fn();

const track: DAWTrack = {
  id: 'track-1',
  name: 'Keys',
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isRecordArmed: false,
  isLocked: false,
};

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
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
});

test('zooms timeline track height from the toolbar', () => {
  act(() => {
    useDAWStore.setState({tracks: [track]});
  });
  render(<App />);
  const surface = document.querySelector('.timeline-surface') as HTMLDivElement;
  const sidebarRow = document.querySelector('.track-row') as HTMLDivElement;

  expect(surface.style.height).toBe(`${RULER_HEIGHT + ROW_HEIGHT + TRACK_SIDEBAR_FOOTER_HEIGHT}px`);
  expect(sidebarRow.style.height).toBe(`${ROW_HEIGHT}px`);

  fireEvent.change(screen.getByLabelText('Track height'), {
    target: {value: String(ROW_HEIGHT + 16)},
  });

  expect(surface.style.height).toBe(
    `${RULER_HEIGHT + ROW_HEIGHT + 16 + TRACK_SIDEBAR_FOOTER_HEIGHT}px`,
  );
  expect(sidebarRow.style.height).toBe(`${ROW_HEIGHT + 16}px`);

  fireEvent.change(screen.getByLabelText('Track height'), {
    target: {value: String(ROW_HEIGHT)},
  });
  expect(surface.style.height).toBe(`${RULER_HEIGHT + ROW_HEIGHT + TRACK_SIDEBAR_FOOTER_HEIGHT}px`);
});

test('applies per-track height scale from the sidebar control', () => {
  act(() => {
    useDAWStore.setState({tracks: [{...track, trackHeightScale: 1.5}]});
  });
  render(<App />);
  const surface = document.querySelector('.timeline-surface') as HTMLDivElement;
  const sidebarRow = document.querySelector('.track-row') as HTMLDivElement;

  expect(surface.style.height).toBe(
    `${RULER_HEIGHT + ROW_HEIGHT * 1.5 + TRACK_SIDEBAR_FOOTER_HEIGHT}px`,
  );
  expect(sidebarRow.style.height).toBe(`${ROW_HEIGHT * 1.5}px`);

  fireEvent.click(screen.getByRole('button', {name: 'Show track details for Keys'}));
  fireEvent.change(screen.getByLabelText('Track height for Keys'), {
    target: {value: '1.25'},
  });

  expect(useDAWStore.getState().tracks[0]?.trackHeightScale).toBe(1.25);
  expect(surface.style.height).toBe(
    `${RULER_HEIGHT + ROW_HEIGHT * 1.25 + TRACK_SIDEBAR_FOOTER_HEIGHT}px`,
  );
  expect(sidebarRow.style.height).toBe(`${ROW_HEIGHT * 1.25}px`);
});
