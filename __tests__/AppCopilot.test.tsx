import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
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
    const target = this.getAttribute('data-guide-target');
    if (target === 'add-track-button') {
      return {x: 12, y: 320, left: 12, top: 320, right: 132, bottom: 354, width: 120, height: 34, toJSON: () => ({})};
    }
    if (target === 'audio-settings-button') {
      return {x: 900, y: 12, left: 900, top: 12, right: 932, bottom: 40, width: 32, height: 28, toJSON: () => ({})};
    }
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

test('moves Mixer into the side-panel group and opens Copilot from the standalone button', async () => {
  render(<App />);

  const sidePanelGroup = screen.getByRole('group', {name: 'Side panels'});
  expect(within(sidePanelGroup).getByRole('button', {name: 'Mixer'})).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));

  expect(screen.getByRole('complementary', {name: 'Copilot'})).toBeInTheDocument();
  expect(screen.queryByText('Copilot ready.')).not.toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByLabelText('Message Copilot')).toHaveFocus();
  });
});

test('shows a Copilot answer and highlights the add-track target', async () => {
  ask.mockResolvedValueOnce({
    ok: true,
    answer: {
      text: 'Use + Add track in the Tracks sidebar.',
      actions: [{type: 'show_ui_guide', targetId: 'add-track-button'}],
    },
  });
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  fireEvent.change(screen.getByLabelText('Message Copilot'), {
    target: {value: 'How do I add a track?'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

  expect(await screen.findByText('Use + Add track in the Tracks sidebar.')).toBeInTheDocument();
  const request = ask.mock.calls[0][0];
  expect(request.context.visibleTargets.some((target: {id: string}) => target.id === 'add-track-button')).toBe(true);
  expect(request.context.project).toMatchObject({bpm: 120, trackCount: 0, isPlaying: false});
  expect(screen.getByLabelText('Message Copilot')).toHaveFocus();
  await waitFor(() => {
    expect(screen.getByLabelText('Guided target: + Add track')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', {name: 'Refresh guide highlight'}));
  expect(screen.queryByLabelText('Guided target: + Add track')).not.toBeInTheDocument();
});

test('sends visible Track Details popup controls in Copilot context', async () => {
  useDAWStore.getState().addTrackFromTemplate('drum_machine');
  ask.mockResolvedValueOnce({ok: true, answer: {text: 'I can see the details.', actions: []}});
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: /Show track details for/}));
  await waitFor(() => expect(screen.getByRole('dialog', {name: /Track details for/})).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  fireEvent.change(screen.getByLabelText('Message Copilot'), {
    target: {value: 'What controls are in this popup?'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

  await waitFor(() => expect(ask).toHaveBeenCalled());
  const targets = ask.mock.calls[0][0].context.visibleTargets as Array<{label: string; id: string}>;
  expect(targets.some(target => target.label.includes('Freeze'))).toBe(true);
  expect(targets.some(target => target.id.includes(':routing-output'))).toBe(true);
});

test('can reveal selected track details from a Copilot navigation action', async () => {
  useDAWStore.getState().addTrackFromTemplate('drum_machine');
  ask.mockResolvedValueOnce({
    ok: true,
    answer: {
      text: 'Opening track details.',
      actions: [{type: 'reveal_ui_target', targetId: 'track-details'}],
    },
  });
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  fireEvent.change(screen.getByLabelText('Message Copilot'), {
    target: {value: 'Show me track details'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

  await waitFor(() => expect(screen.getByRole('dialog', {name: /Track details for/})).toBeInTheDocument());
  await waitFor(() => expect(screen.getByLabelText(/Guided target:/)).toBeInTheDocument());
});

test('can reveal the selected track volume control from a hidden workflow action', async () => {
  useDAWStore.getState().addTrackFromTemplate('drum_machine');
  const trackId = useDAWStore.getState().tracks[0]!.id;
  ask.mockResolvedValueOnce({
    ok: true,
    answer: {
      text: 'Opening the selected track volume control.',
      actions: [{type: 'reveal_ui_target', targetId: `track:${trackId}:volume`}],
    },
  });
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  fireEvent.change(screen.getByLabelText('Message Copilot'), {
    target: {value: 'Show me the piano volume'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

  await waitFor(() => expect(screen.getByRole('dialog', {name: /Track details for/})).toBeInTheDocument());
  await waitFor(() => expect(screen.getByLabelText(/Guided target: Volume for/)).toBeInTheDocument());
  const request = ask.mock.calls[0][0];
  expect(request.context.workflows.map((workflow: {entrypointTargetId: string}) => workflow.entrypointTargetId))
    .toContain(`track:${trackId}:volume`);
});

test('can reveal the Add Track menu without creating a track', async () => {
  ask.mockResolvedValueOnce({
    ok: true,
    answer: {
      text: 'Opening Add Track.',
      actions: [{type: 'reveal_ui_target', targetId: 'add-track-button'}],
    },
  });
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  fireEvent.change(screen.getByLabelText('Message Copilot'), {
    target: {value: 'Show me add track options'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

  await waitFor(() => expect(screen.getByRole('menu', {name: 'Add track menu'})).toBeInTheDocument());
  expect(useDAWStore.getState().tracks).toHaveLength(0);
});

test('renders MIDI option cards, previews natively, and imports a bass track', async () => {
  ask.mockResolvedValueOnce({
    ok: true,
    answer: {
      text: 'I made a bassline option.',
      actions: [],
      midiOptions: [{
        id: 'bass-a',
        label: 'Root Push',
        role: 'bassline',
        description: 'Simple root motion.',
        startBeat: 0,
        lengthBeats: 4,
        target: {instrumentId: 'bass_growly', presetId: 'growly_bass_lite', label: 'Electric Bass'},
        createTrack: {name: 'Electric Bass', instrumentId: 'bass_growly', presetId: 'growly_bass_lite'},
        notes: [{note: 40, velocity: 100, startBeat: 0, lengthBeats: 1}],
      }],
    },
  });
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  fireEvent.change(screen.getByLabelText('Message Copilot'), {
    target: {value: 'Give me a bassline'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

  expect(await screen.findByText('Root Push')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Play preview'}));
  expect(sendCommand).toHaveBeenCalledWith('start_midi_phrase_preview', expect.stringContaining('"note":40'));

  fireEvent.click(screen.getByRole('button', {name: 'Import MIDI option'}));
  expect(sendCommand).toHaveBeenCalledWith('stop_midi_phrase_preview', '{}');
  expect(useDAWStore.getState().tracks.find(track => track.instrumentId === 'bass_growly')).toBeTruthy();
  expect(useDAWStore.getState().blocks[0]).toMatchObject({name: 'Root Push', type: 'midi'});
});

test('can open an existing right panel from a Copilot action', async () => {
  ask.mockResolvedValueOnce({
    ok: true,
    answer: {
      text: 'Audio settings are in the top-right toolbar.',
      actions: [
        {type: 'open_right_panel', panel: 'audio'},
        {type: 'show_ui_guide', targetId: 'audio-settings-button'},
      ],
    },
  });
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'Copilot'}));
  fireEvent.change(screen.getByLabelText('Message Copilot'), {
    target: {value: 'Open audio settings'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

  await waitFor(() => {
    expect(screen.getByRole('complementary', {name: 'Audio'})).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByLabelText('Guided target: Audio settings')).toBeInTheDocument();
  });
});
