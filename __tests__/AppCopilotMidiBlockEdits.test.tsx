import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock} from '../src/store/useDAWStore';
import {resetCopilotChatHistoryForTests} from '../src/assistant/copilotChatHistory';
import {resetCopilotStagingForTests} from '../src/assistant/copilotStaging';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const agentAsk = jest.fn();

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

// One Copilot path now: a structured MIDI block edit comes back via answer.midiBlockEdits
// and becomes a Cursor-style staged proposal (preview/accept/reject), not a pending card.
function agentAnswer(text: string, midiBlockEdits: unknown[]) {
  return {ok: true, text, patch: null, answer: {text, actions: [], midiBlockEdits}, model: 'mimo', turns: 1};
}

function openCopilotAndSend(message: string): void {
  fireEvent.click(screen.getByRole('button', {name: 'Co-producer'}));
  const input = screen.getByRole('textbox', {name: 'Message Co-producer'});
  fireEvent.change(input, {target: {value: message}});
  fireEvent.click(screen.getByRole('button', {name: 'Send message'}));
}

beforeEach(() => {
  resetStore();
  resetCopilotChatHistoryForTests();
  resetCopilotStagingForTests();
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({ok: true, data: {deviceName: 'Mock Output', sampleRate: 48000}});
    }
    return JSON.stringify({ok: true, data: {}});
  });
  window.audioEngine = {sendCommand, onEvent: () => () => undefined};
  window.copilot = {agentAsk};
  HTMLElement.prototype.scrollIntoView = jest.fn();
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10, toJSON: () => ({})};
  };
});

afterEach(() => {
  cleanup();
  resetCopilotChatHistoryForTests();
  resetCopilotStagingForTests();
  sendCommand.mockReset();
  agentAsk.mockReset();
  delete window.audioEngine;
  delete window.copilot;
});

test('stages a Copilot MIDI block create and commits it on Accept', async () => {
  useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
  const trackId = useDAWStore.getState().tracks[0]!.id;
  agentAsk.mockResolvedValueOnce(agentAnswer('I prepared a MIDI block.', [{
    op: 'upsertMidiBlock',
    id: 'clip-ai',
    trackId,
    name: 'AI Lead',
    startBeat: 0,
    lengthBeats: 4,
    notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
  }]));

  render(<App />);
  openCopilotAndSend('add a 4 beat midi block');

  expect(await screen.findByText(/I prepared a MIDI block\./)).toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Stage & listen'})).not.toBeInTheDocument();
  expect(await screen.findByRole('button', {name: 'Accept'})).toBeInTheDocument();
  const request = agentAsk.mock.calls[0][0];
  expect(request.context.arrangement.softwareInstrumentTracks[0]).toMatchObject({id: trackId, isSelected: true});

  await waitFor(() => expect(useDAWStore.getState().blocks).toHaveLength(1));
  expect(useDAWStore.getState().blocks[0]).toMatchObject({id: 'clip-ai', trackId, name: 'AI Lead', type: 'midi'});

  // Accept commits the already-live preview and collapses the card.
  fireEvent.click(screen.getByRole('button', {name: 'Accept'}));
  await waitFor(() => expect(screen.queryByRole('button', {name: 'Accept'})).not.toBeInTheDocument());
  expect(useDAWStore.getState().blocks).toHaveLength(1);
  expect(useDAWStore.getState().blocks[0]).toMatchObject({id: 'clip-ai', name: 'AI Lead'});
});

test('reverts a staged MIDI block create on Reject', async () => {
  useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
  const trackId = useDAWStore.getState().tracks[0]!.id;
  agentAsk.mockResolvedValueOnce(agentAnswer('Here is an idea.', [{
    op: 'upsertMidiBlock',
    id: 'clip-ai',
    trackId,
    name: 'AI Lead',
    startBeat: 0,
    lengthBeats: 4,
    notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
  }]));

  render(<App />);
  openCopilotAndSend('add a midi block');

  expect(await screen.findByRole('button', {name: 'Reject'})).toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Stage & listen'})).not.toBeInTheDocument();
  await waitFor(() => expect(useDAWStore.getState().blocks).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', {name: 'Reject'}));

  // Reject restores the exact pre-stage state — the previewed block is gone.
  await waitFor(() => expect(useDAWStore.getState().blocks).toHaveLength(0));
});

test('stages a replacement for an existing MIDI block', async () => {
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
  agentAsk.mockResolvedValueOnce(agentAnswer('I prepared a replacement.', [{
    op: 'upsertMidiBlock',
    id: block.id,
    trackId,
    name: 'New Hook',
    startBeat: 4,
    lengthBeats: 4,
    notes: [{note: 67, velocity: 100, startBeat: 0, lengthBeats: 2}],
  }]));

  render(<App />);
  openCopilotAndSend('replace the selected midi block');
  expect(await screen.findByRole('button', {name: 'Accept'})).toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Stage & listen'})).not.toBeInTheDocument();

  await waitFor(() => expect(useDAWStore.getState().blocks[0]).toMatchObject({
    id: block.id,
    name: 'New Hook',
    startBeat: 4,
    notes: [{note: 67, velocity: 100, startBeat: 0, lengthBeats: 2}],
  }));
  fireEvent.click(screen.getByRole('button', {name: 'Accept'}));
  await waitFor(() => expect(useDAWStore.getState().blocks[0]).toMatchObject({id: block.id, name: 'New Hook'}));
});

test('surfaces an error and stages nothing when the target is locked', async () => {
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
  agentAsk.mockResolvedValueOnce(agentAnswer('I prepared a rename.', [
    {op: 'renameMidiBlock', blockId: block.id, name: 'Renamed'},
  ]));

  render(<App />);
  openCopilotAndSend('rename the selected midi block');

  // A locked target fails conversion before staging → the error is surfaced in the
  // message and no preview card appears.
  expect(await screen.findByText(/locked or on a locked\/frozen track/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Stage & listen'})).not.toBeInTheDocument();
  expect(useDAWStore.getState().blocks[0]?.name).toBe('Locked Clip');
});
