import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock} from '../src/store/useDAWStore';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const ask = jest.fn();

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

function openCopilotAndSend(message: string): void {
  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  fireEvent.change(screen.getByLabelText('Message Copilot'), {target: {value: message}});
  fireEvent.click(screen.getByRole('button', {name: 'Send'}));
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
  window.copilot = {ask};
  HTMLElement.prototype.scrollIntoView = jest.fn();
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10, toJSON: () => ({})};
  };
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  ask.mockReset();
  delete window.audioEngine;
  delete window.copilot;
});

test('keeps a Copilot MIDI block create pending until Apply is clicked', async () => {
  useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
  const trackId = useDAWStore.getState().tracks[0]!.id;
  ask.mockResolvedValueOnce({
    ok: true,
    answer: {
      text: 'I prepared a MIDI block.',
      actions: [],
      midiBlockEdits: [{
        op: 'upsertMidiBlock',
        id: 'clip-ai',
        trackId,
        name: 'AI Lead',
        startBeat: 0,
        lengthBeats: 4,
        notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
      }],
    },
  });

  render(<App />);
  openCopilotAndSend('add a 4 beat midi block');

  expect(await screen.findByText('I prepared a MIDI block.')).toBeInTheDocument();
  expect(useDAWStore.getState().blocks).toHaveLength(0);
  const request = ask.mock.calls[0][0];
  expect(request.context.arrangement.softwareInstrumentTracks[0]).toMatchObject({id: trackId, isSelected: true});
  const card = screen.getByLabelText('Pending MIDI block edit');
  fireEvent.click(within(card).getByRole('button', {name: 'Apply'}));

  await waitFor(() => expect(useDAWStore.getState().blocks).toHaveLength(1));
  expect(useDAWStore.getState().blocks[0]).toMatchObject({
    id: 'clip-ai',
    trackId,
    name: 'AI Lead',
    type: 'midi',
  });
});

test('replaces an existing MIDI block as one confirmed operation', async () => {
  useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
  const trackId = useDAWStore.getState().tracks[0]!.id;
  const block: DAWBlock = {
    id: 'clip-existing',
    trackId,
    name: 'Old',
    startBeat: 0,
    lengthBeats: 4,
    type: 'midi',
    color: '#4a7fd4',
    notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
  };
  useDAWStore.setState({blocks: [block], selectedBlockId: block.id, selectedBlockIds: [block.id]});
  ask.mockResolvedValueOnce({
    ok: true,
    answer: {
      text: 'I prepared a replacement.',
      actions: [],
      midiBlockEdits: [{
        op: 'upsertMidiBlock',
        id: block.id,
        trackId,
        name: 'New Hook',
        startBeat: 4,
        lengthBeats: 4,
        notes: [{note: 67, velocity: 100, startBeat: 0, lengthBeats: 2}],
      }],
    },
  });

  render(<App />);
  openCopilotAndSend('replace the selected midi block');
  fireEvent.click(within(await screen.findByLabelText('Pending MIDI block edit')).getByRole('button', {name: 'Apply'}));

  await waitFor(() => expect(useDAWStore.getState().blocks[0]).toMatchObject({
    id: block.id,
    name: 'New Hook',
    startBeat: 4,
    notes: [{note: 67, velocity: 100, startBeat: 0, lengthBeats: 2}],
  }));
});

test('rejects a pending edit if the target becomes locked before Apply', async () => {
  useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
  const trackId = useDAWStore.getState().tracks[0]!.id;
  const block: DAWBlock = {
    id: 'clip-locked',
    trackId,
    name: 'Locked Clip',
    startBeat: 0,
    lengthBeats: 4,
    type: 'midi',
    color: '#4a7fd4',
    notes: [],
    isLocked: true,
  };
  useDAWStore.setState({blocks: [block], selectedBlockId: block.id, selectedBlockIds: [block.id]});
  ask.mockResolvedValueOnce({
    ok: true,
    answer: {
      text: 'I prepared a rename.',
      actions: [],
      midiBlockEdits: [{op: 'renameMidiBlock', blockId: block.id, name: 'Renamed'}],
    },
  });

  render(<App />);
  openCopilotAndSend('rename the selected midi block');
  const card = await screen.findByLabelText('Pending MIDI block edit');
  fireEvent.click(within(card).getByRole('button', {name: 'Apply'}));

  expect(await within(card).findByText(/locked\/frozen/i)).toBeInTheDocument();
  expect(useDAWStore.getState().blocks[0]?.name).toBe('Locked Clip');
});
