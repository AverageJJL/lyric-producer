import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));
jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  refreshPlaybackDeviceOnly: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {resetCopilotChatHistoryForTests} from '../src/assistant/copilotChatHistory';
import {resetCopilotStagingForTests} from '../src/assistant/copilotStaging';
import {buildBlockStructureShortcut} from '../electron/copilotBuildShortcuts';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const agentAsk = jest.fn();

function resetAudioStore(): void {
  const names = ['bass', 'drums', 'guitar', 'other', 'piano'];
  const tracks: DAWTrack[] = names.map((name, index) => ({
    id: `track-${index + 1}`,
    name: `Voice ${index + 1}`,
    type: 'voice_audio',
    instrumentId: 'voice_audio',
    presetId: 'voice_audio',
    isMuted: false,
    isSolo: false,
    isRecordArmed: false,
    isLocked: false,
  }));
  const blocks: DAWBlock[] = names.map((name, index) => ({
    id: `clip-${index + 1}`,
    trackId: `track-${index + 1}`,
    name: `Midnight_Hoodie_${name}`,
    type: 'audio',
    color: '#4a7fd4',
    startBeat: 0,
    lengthBeats: 202.8,
    sourceLengthBeats: 202.8,
    sourceOffsetBeats: 0,
    audioFilePath: `imports/${name}.wav`,
    absoluteAudioFilePath: `/tmp/${name}.wav`,
    waveformPeaks: [0.1, 0.35, 0.2, 0.5, 0.15],
  }));
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks,
    patterns: {},
    blocks,
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

beforeEach(() => {
  resetAudioStore();
  resetCopilotChatHistoryForTests();
  resetCopilotStagingForTests();
  sendCommand.mockImplementation(() => JSON.stringify({ok: true, data: {deviceName: 'Mock Output', sampleRate: 48000}}));
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

test('renders and stages a local audio arrangement patch without an error bubble', async () => {
  agentAsk.mockImplementationOnce(async request => {
    const result = buildBlockStructureShortcut(request.message, request.tree);
    if (!result) {
      throw new Error('shortcut returned null');
    }
    return {
      ok: true,
      text: result.text,
      patch: result.patch,
      reports: [],
      model: 'local-block-structure',
      turns: 0,
    };
  });

  render(<App />);
  fireEvent.click(screen.getByRole('button', {name: 'Co-producer'}));
  const input = screen.getByLabelText('Message Co-producer');
  fireEvent.change(input, {target: {value: 'Make the hook feel bigger without adding new music. Use mutes, clip splits, and gain changes only.'}});
  fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

  await waitFor(() => expect(agentAsk).toHaveBeenCalled());
  expect(await screen.findByText(/Prepared a 5-section split-and-dropout arrangement/)).toBeInTheDocument();
  const proposalCard = await screen.findByRole('article', {name: 'Co-producer proposed edit'});
  expect(screen.queryByRole('button', {name: 'Stage & listen'})).not.toBeInTheDocument();
  expect(screen.queryByText(/click Stage & listen/i)).not.toBeInTheDocument();
  expect(within(proposalCard).getAllByText('Stage split-and-dropout arrangement from existing audio')).toHaveLength(1);
  expect(within(proposalCard).getByRole('button', {name: 'Accept'})).toBeInTheDocument();
  expect(within(proposalCard).getByRole('button', {name: 'Reject'})).toBeInTheDocument();
  expect(screen.queryByText('Co-producer request failed before a response was returned.')).not.toBeInTheDocument();

  let state = useDAWStore.getState();
  await waitFor(() => {
    state = useDAWStore.getState();
    expect(state.blocks.filter(block => block.id.startsWith('build-'))).toHaveLength(11);
  });
  expect(state.blocks.filter(block => block.id.startsWith('build-')).every(block => block.waveformPeaks?.length === 5)).toBe(true);
  expect(state.blocks.some(block =>
    block.id.startsWith('build-') &&
    block.name.includes('Groove vocal space') &&
    block.clipGainDb === -10,
  )).toBe(true);
  expect(state.tracks.filter(track => /^Voice \d+$/.test(track.name)).every(track => track.pendingDeletion === true)).toBe(true);

  fireEvent.click(within(proposalCard).getByRole('button', {name: 'Accept'}));
  await waitFor(() => {
    state = useDAWStore.getState();
    expect(state.tracks.filter(track => /^Voice \d+$/.test(track.name))).toHaveLength(0);
  });
});
