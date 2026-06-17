import React from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
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
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  window.localStorage.clear();
});

test('return to zero scrolls the timeline viewport home even when already at beat zero', () => {
  render(<App />);
  const scroll = document.querySelector('.timeline-horizontal-scroll') as HTMLDivElement;
  scroll.scrollLeft = 720;

  fireEvent.click(screen.getByRole('button', {name: 'Return to start'}));

  expect(useDAWStore.getState().playheadBeat).toBe(0);
  expect(scroll.scrollLeft).toBe(0);
  expect(sendCommand).toHaveBeenCalledWith('return_to_zero', JSON.stringify({}));
});

test('Enter on the focused workspace returns the timeline to zero', () => {
  useDAWStore.setState({playheadBeat: 12, playheadSeconds: 6});
  render(<App />);
  const workspace = screen.getByLabelText('Workspace') as HTMLElement;
  const scroll = document.querySelector('.timeline-horizontal-scroll') as HTMLDivElement;
  scroll.scrollLeft = 480;
  sendCommand.mockClear();

  workspace.focus();
  fireEvent.keyDown(workspace, {key: 'Enter'});

  expect(useDAWStore.getState().playheadBeat).toBe(0);
  expect(scroll.scrollLeft).toBe(0);
  expect(sendCommand).toHaveBeenCalledWith('return_to_zero', JSON.stringify({}));
});

test('transport keys override a focused toolbar button without reactivating it', () => {
  useDAWStore.setState({playheadBeat: 12, playheadSeconds: 6});
  render(<App />);
  const clickButton = screen.getByRole('button', {name: 'Metronome'});
  sendCommand.mockClear();

  fireEvent.click(clickButton);
  expect(useDAWStore.getState().isMetronomeEnabled).toBe(false);

  const spaceWasHandled = !fireEvent.keyDown(clickButton, {key: ' ', code: 'Space'});
  expect(spaceWasHandled).toBe(true);
  expect(useDAWStore.getState().isPlaying).toBe(true);
  expect(useDAWStore.getState().isMetronomeEnabled).toBe(false);

  const enterWasHandled = !fireEvent.keyDown(clickButton, {key: 'Enter', code: 'Enter'});
  expect(enterWasHandled).toBe(true);
  expect(useDAWStore.getState().playheadBeat).toBe(0);
  expect(useDAWStore.getState().isMetronomeEnabled).toBe(false);
  expect(sendCommand).toHaveBeenCalledWith('return_to_zero', JSON.stringify({}));
});
