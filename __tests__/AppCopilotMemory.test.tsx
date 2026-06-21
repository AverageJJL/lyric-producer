import React from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';

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
const agentAsk = jest.fn();
const compact = jest.fn();

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

beforeEach(() => {
  resetStore();
  resetCopilotChatHistoryForTests();
  sendCommand.mockReturnValue(JSON.stringify({ok: true, data: {}}));
  window.audioEngine = {sendCommand, onEvent: () => () => undefined};
  window.copilot = {agentAsk, compact};
  HTMLElement.prototype.scrollIntoView = jest.fn();
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10, toJSON: () => ({})});
});

afterEach(() => {
  cleanup();
  resetCopilotChatHistoryForTests();
  sendCommand.mockReset();
  agentAsk.mockReset();
  compact.mockReset();
  delete window.audioEngine;
  delete window.copilot;
});

async function sendCopilotMessage(text: string, expectedAnswer: string): Promise<void> {
  const input = screen.getByRole('textbox', {name: 'Message Copilot'});
  fireEvent.change(input, {target: {value: text}});
  fireEvent.click(screen.getByRole('button', {name: 'Send message'}));
  await screen.findByText(expectedAnswer);
}

test('sends more than six previous Copilot messages before compaction', async () => {
  let answerIndex = 0;
  agentAsk.mockImplementation(async () => {
    answerIndex += 1;
    return {ok: true, text: `ok-${answerIndex}`, patch: null, answer: {text: `ok-${answerIndex}`, actions: []}, model: 'xiaomi/mimo-v2.5', turns: 1};
  });
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  for (let index = 1; index <= 5; index += 1) {
    await sendCopilotMessage(`Question ${index}`, `ok-${index}`);
  }

  expect(compact).not.toHaveBeenCalled();
  expect(agentAsk.mock.calls[4][0].history).toHaveLength(8);
});

test('auto-compacts older Copilot chat and sends summary plus recent tail', async () => {
  let answerIndex = 0;
  agentAsk.mockImplementation(async () => {
    answerIndex += 1;
    return {ok: true, text: `long-ok-${answerIndex}`, patch: null, answer: {text: `long-ok-${answerIndex}`, actions: []}, model: 'xiaomi/mimo-v2.5', turns: 1};
  });
  compact.mockResolvedValue({ok: true, summary: 'Compacted durable memory.'});
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  const longPrompt = 'compose '.repeat(4700);
  for (let index = 1; index <= 9; index += 1) {
    await sendCopilotMessage(`${longPrompt}${index}`, `long-ok-${index}`);
  }

  expect(compact).toHaveBeenCalled();
  const lastRequest = agentAsk.mock.calls[8][0];
  expect(lastRequest.conversationSummary).toBe('Compacted durable memory.');
  expect(lastRequest.history.length).toBeLessThanOrEqual(12);
});

test('keeps Copilot chats across sidebar close, new chat, and history selection', async () => {
  let answerIndex = 0;
  agentAsk.mockImplementation(async () => {
    answerIndex += 1;
    return {
      ok: true,
      text: `answer-${answerIndex}`,
      patch: null,
      answer: {text: `answer-${answerIndex}`, actions: []},
      model: 'xiaomi/mimo-v2.5',
      turns: 1,
    };
  });
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  await sendCopilotMessage('First question', 'answer-1');

  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  expect(screen.queryByText('answer-1')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  expect(screen.getByText('First question')).toBeInTheDocument();
  expect(screen.getByText('answer-1')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'New Chat'}));
  expect(screen.queryByText('answer-1')).not.toBeInTheDocument();
  await sendCopilotMessage('Second question', 'answer-2');
  expect(agentAsk.mock.calls[1][0].history).toHaveLength(0);

  fireEvent.click(screen.getByRole('button', {name: 'History'}));
  fireEvent.click(screen.getByRole('option', {name: /First question/}));

  expect(screen.getByText('First question')).toBeInTheDocument();
  expect(screen.getByText('answer-1')).toBeInTheDocument();
  expect(screen.queryByText('Second question')).not.toBeInTheDocument();
});
