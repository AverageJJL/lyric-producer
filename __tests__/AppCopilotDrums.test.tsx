import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {resetCopilotChatHistoryForTests} from '../src/assistant/copilotChatHistory';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const sendCommandAsync = jest.fn();
const agentAsk = jest.fn();

function resetStore(): void {
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [],
    patterns: {},
    blocks: [],
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    isRecording: false,
    recordingBlockId: null,
    playheadBeat: 0,
    playheadSeconds: 0,
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
  resetCopilotChatHistoryForTests();
  sendCommand.mockImplementation(() => JSON.stringify({ok: true, data: {}}));
  sendCommandAsync.mockImplementation((command: string, payload: string) => Promise.resolve(sendCommand(command, payload)));
  window.audioEngine = {sendCommand, sendCommandAsync, onEvent: () => () => undefined};
  window.copilot = {agentAsk};
  HTMLElement.prototype.scrollIntoView = jest.fn();
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40, toJSON: () => ({})});
});

afterEach(() => {
  cleanup();
  resetCopilotChatHistoryForTests();
  sendCommand.mockReset();
  sendCommandAsync.mockReset();
  agentAsk.mockReset();
  delete window.audioEngine;
  delete window.copilot;
});

test('renders drum pattern options, previews natively, and imports a step sequencer clip', async () => {
  agentAsk.mockResolvedValueOnce({
    ok: true,
    text: 'I made a drum beat.',
    patch: null,
    model: 'test-model',
    turns: 1,
    answer: {
      text: 'I made a drum beat.',
      actions: [],
      drumPatternOptions: [{
        id: 'beat-a',
        label: 'Backbeat',
        description: 'Kick, snare, and hats.',
        startBeat: 0,
        lengthBeats: 4,
        kitId: 'pop_basic',
        lanes: {
          kick: [0, 8],
          snare: [4, 12],
          hatClosed: [0, 2, 4, 6, 8, 10, 12, 14],
          hatOpen: [],
          tom1: [],
          tom2: [],
          perc: [],
          clap: [],
        },
      }],
    },
  });

  render(<App />);
  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  const input = screen.getByLabelText('Message Copilot');
  fireEvent.change(input, {target: {value: 'Make a drum beat'}});
  fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

  expect(await screen.findByText('Backbeat')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Play preview'}));
  await waitFor(() => {
    expect(sendCommandAsync).toHaveBeenCalledWith('start_pattern_preview', expect.stringContaining('"kick":[0,8]'));
  });

  fireEvent.click(screen.getByRole('button', {name: 'Import drum pattern'}));
  const state = useDAWStore.getState();
  expect(sendCommand).toHaveBeenCalledWith('stop_pattern_preview', '{}');
  expect(state.tracks[0]).toMatchObject({type: 'drum_machine'});
  expect(state.blocks[0]).toMatchObject({type: 'audio', patternId: expect.any(String), name: 'Backbeat'});
  expect(await screen.findByRole('heading', {name: 'Drum Machine'})).toBeInTheDocument();
});
