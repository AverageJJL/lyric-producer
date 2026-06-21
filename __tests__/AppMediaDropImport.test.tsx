import React from 'react';
import {act, cleanup, createEvent, fireEvent, render, screen, waitFor} from '@testing-library/react';

// <App /> mounts the Copilot panel, which imports ESM markdown/highlighter deps
// that Jest does not transform in this repo's current test setup.
jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

import {emptyProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {midiBytesToBase64, midiFileBytesFromSnapshot} from '../src/music/midiFileExport';
import {defaultLyricDocument} from '../src/store/lyrics';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWTrack} from '../src/store/useDAWStore';
import {PIXELS_PER_BEAT, RULER_BASE_HEIGHT, ROW_HEIGHT} from '../src/ui/timelineLayout';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const sendCommandAsync = jest.fn();
const importAudio = jest.fn();
const importMidi = jest.fn();
const relinkAudio = jest.fn();
const pathForFile = jest.fn();

type DroppedTestFile = File & {mockPath?: string};

function midiFixtureBase64(): string {
  const snapshot = emptyProjectSnapshot();
  snapshot.tracks = [{
    id: 'track-midi',
    name: 'Drop Lead',
    isMuted: false,
    isSolo: false,
    type: 'software_instrument',
    instrumentId: 'synth_lead',
    presetId: 'pop_lead',
    isRecordArmed: false,
    isLocked: false,
  }];
  snapshot.blocks = [{
    id: 'clip-midi',
    trackId: 'track-midi',
    name: 'Drop Lead',
    startBeat: 0,
    lengthBeats: 2,
    type: 'midi',
    color: '#4a7fd4',
    notes: [{note: 67, velocity: 100, startBeat: 0, lengthBeats: 2}],
  }];
  return midiBytesToBase64(midiFileBytesFromSnapshot(snapshot)!);
}

function droppedFile(name: string, path: string): File {
  const file = new File(['fixture'], name) as DroppedTestFile;
  Object.defineProperty(file, 'mockPath', {value: path});
  return file;
}

function audioImportResponse(sourcePath = '/Users/me/drop-loop.wav') {
  const fileName = sourcePath.split(/[\\/]/).pop() ?? 'drop-loop.wav';
  const stem = fileName.replace(/\.[^.]+$/, '') || 'drop-loop';
  return {
    ok: true,
    originalPath: sourcePath,
    absolutePath: `/tmp/imports/${fileName}`,
    relativePath: `imports/${fileName}`,
    name: stem,
  };
}

async function dropMedia(file: File): Promise<void> {
  await act(async () => {
    fireEvent.drop(screen.getByLabelText('Media drop target'), {
      dataTransfer: {files: [file]},
    });
    await Promise.resolve();
  });
}

function timelineSurface(): HTMLElement {
  const surface = document.querySelector('.timeline-surface') as HTMLElement | null;
  if (!surface) {
    throw new Error('Timeline surface was not rendered.');
  }
  Object.defineProperty(surface, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 100,
      y: 80,
      left: 100,
      top: 80,
      right: 1200,
      bottom: 760,
      width: 1100,
      height: 680,
      toJSON: () => ({}),
    }),
  });
  return surface;
}

async function dropTimelineMedia(
  files: File[],
  options: {rawBeat: number; laneIndex?: number} = {rawBeat: 12.4},
): Promise<void> {
  const surface = timelineSurface();
  const laneIndex = options.laneIndex ?? 0;
  await act(async () => {
    const event = createEvent.drop(surface, {
      dataTransfer: {
        files,
        types: ['Files'],
      },
    });
    Object.defineProperty(event, 'clientX', {
      configurable: true,
      value: 100 + options.rawBeat * PIXELS_PER_BEAT,
    });
    Object.defineProperty(event, 'clientY', {
      configurable: true,
      value: 80 + RULER_BASE_HEIGHT + laneIndex * ROW_HEIGHT + 20,
    });
    fireEvent(surface, event);
    await Promise.resolve();
  });
}

function trackFixture(id: string, type: DAWTrack['type']): DAWTrack {
  return {
    id,
    name: type === 'voice_audio' ? 'Audio' : 'Instrument',
    isMuted: false,
    isSolo: false,
    type,
    instrumentId: type === 'voice_audio' ? 'voice_audio' : 'synth_lead',
    presetId: type === 'voice_audio' ? 'voice_audio' : 'pop_lead',
    isRecordArmed: false,
    isInputMonitoringEnabled: false,
    isLocked: false,
  };
}

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
    recordingStartSeconds: null,
    recordingWallClockStart: null,
    recordingError: null,
    playheadBeat: 8,
    playheadSeconds: 4,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    playStartSeconds: 0,
    syncSource: 'ui',
    snapGrid: 'beat',
    isRelativeSnapEnabled: false,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    tempoMap: [],
    meterMap: [],
    scale: null,
    chord: null,
    sections: [],
    lyrics: defaultLyricDocument(),
    midiAudition: null,
  });
}

beforeEach(() => {
  resetStore();
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({ok: true, data: {deviceName: 'Mock Output', sampleRate: 48000}});
    }
    if (command === 'analyze_audio_file') {
      return JSON.stringify({
        ok: true,
        data: {lengthBeats: 3, durationSeconds: 1.5, waveformPeaks: [0.1, 0.9]},
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  sendCommandAsync.mockImplementation((command: string, payloadJson: string) =>
    Promise.resolve(sendCommand(command, payloadJson)),
  );
  importAudio.mockImplementation(async (request?: {path?: string}) =>
    audioImportResponse(request?.path),
  );
  importMidi.mockResolvedValue({
    ok: true,
    originalPath: '/Users/me/drop-lead.mid',
    base64: midiFixtureBase64(),
    name: 'drop-lead',
  });
  relinkAudio.mockResolvedValue({ok: false, canceled: true, error: 'unused'});
  pathForFile.mockImplementation((file: File) => (file as DroppedTestFile).mockPath ?? null);
  window.audioEngine = {sendCommand, sendCommandAsync, onEvent: () => () => undefined};
  window.mediaImport = {pathForFile, importAudio, importMidi, relinkAudio};
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  sendCommandAsync.mockReset();
  importAudio.mockReset();
  importMidi.mockReset();
  relinkAudio.mockReset();
  pathForFile.mockReset();
  delete window.mediaImport;
});

test('imports a dropped audio file through the Electron file-path resolver', async () => {
  render(<App />);

  await dropMedia(droppedFile('drop-loop.wav', '/Users/me/drop-loop.wav'));

  expect(pathForFile).toHaveBeenCalledTimes(1);
  expect(importAudio).toHaveBeenCalledWith({path: '/Users/me/drop-loop.wav'});
  expect(importMidi).not.toHaveBeenCalled();
  expect(sendCommandAsync).toHaveBeenCalledWith(
    'analyze_audio_file',
    JSON.stringify({absoluteAudioFilePath: '/tmp/imports/drop-loop.wav'}),
  );
  expect(useDAWStore.getState().blocks[0]).toMatchObject({
    name: 'drop-loop',
    startBeat: 8,
    lengthBeats: 3,
    audioFilePath: 'imports/drop-loop.wav',
  });
});

test('drops an audio file onto the timeline by creating a new audio lane', async () => {
  const voiceTrack = trackFixture('track-voice', 'voice_audio');
  useDAWStore.setState({tracks: [voiceTrack]});
  render(<App />);

  await dropTimelineMedia([droppedFile('drop-loop.wav', '/Users/me/drop-loop.wav')], {
    rawBeat: 12.4,
  });

  await waitFor(() => expect(importAudio).toHaveBeenCalledTimes(1));
  expect(importAudio).toHaveBeenCalledWith({path: '/Users/me/drop-loop.wav'});
  const state = useDAWStore.getState();
  expect(state.tracks).toHaveLength(2);
  expect(state.tracks[1]).toMatchObject({type: 'voice_audio'});
  expect(state.blocks[0]).toMatchObject({
    trackId: state.tracks[1]?.id,
    name: 'drop-loop',
    startBeat: 12,
    audioFilePath: 'imports/drop-loop.wav',
  });
});

test('drops audio on an instrument lane by creating a voice audio lane', async () => {
  const instrumentTrack = trackFixture('track-instrument', 'software_instrument');
  useDAWStore.setState({tracks: [instrumentTrack]});
  render(<App />);

  await dropTimelineMedia([droppedFile('drop-loop.wav', '/Users/me/drop-loop.wav')], {
    rawBeat: 6.6,
  });

  await waitFor(() => expect(importAudio).toHaveBeenCalledTimes(1));
  const state = useDAWStore.getState();
  expect(state.tracks[0]).toMatchObject({id: 'track-instrument', type: 'software_instrument'});
  expect(state.tracks[1]).toMatchObject({type: 'voice_audio'});
  expect(state.blocks[0]).toMatchObject({
    trackId: state.tracks[1]?.id,
    startBeat: 7,
    audioFilePath: 'imports/drop-loop.wav',
  });
});

test('drops audio on an empty timeline by creating a voice audio lane', async () => {
  render(<App />);

  await dropTimelineMedia([droppedFile('empty-drop.wav', '/Users/me/empty-drop.wav')], {
    rawBeat: 2.2,
  });

  await waitFor(() => expect(importAudio).toHaveBeenCalledTimes(1));
  const state = useDAWStore.getState();
  expect(state.tracks[0]).toMatchObject({type: 'voice_audio'});
  expect(state.blocks[0]).toMatchObject({
    trackId: state.tracks[0]?.id,
    startBeat: 2,
    audioFilePath: 'imports/empty-drop.wav',
  });
  expect(document.querySelector('.timeline-block .waveform-preview')).toBeTruthy();
  expect(document.querySelector('.timeline-block .waveform-fill')).toBeTruthy();
});

test('plays an imported timeline audio clip without staying in native-start loading state', async () => {
  render(<App />);

  await dropTimelineMedia([droppedFile('drop-loop.wav', '/Users/me/drop-loop.wav')], {
    rawBeat: 0,
  });
  await waitFor(() => expect(useDAWStore.getState().blocks).toHaveLength(1));
  await waitFor(() => {
    expect(sendCommand.mock.calls.some(([command]) => command === 'setTracks')).toBe(true);
    expect(sendCommandAsync.mock.calls.some(([command]) => command === 'upsert_audio_clip'))
      .toBe(true);
  });
  const importCommandNames = sendCommand.mock.calls.map(([command]) => command);
  const importAsyncCommandNames = sendCommandAsync.mock.calls.map(([command]) => command);
  const importSetTracksIndex = importCommandNames.indexOf('setTracks');
  const importUpsertAudioIndex = importAsyncCommandNames.indexOf('upsert_audio_clip');
  expect(importSetTracksIndex).toBeGreaterThanOrEqual(0);
  expect(importUpsertAudioIndex).toBeGreaterThanOrEqual(0);
  expect(JSON.parse(sendCommandAsync.mock.calls[importUpsertAudioIndex]?.[1] ?? '{}')).toMatchObject({
    audioFilePath: 'imports/drop-loop.wav',
    absoluteAudioFilePath: '/tmp/imports/drop-loop.wav',
  });
  sendCommand.mockClear();
  sendCommandAsync.mockClear();

  fireEvent.click(screen.getByRole('button', {name: 'Play'}));

  const commandNames = sendCommand.mock.calls.map(([command]) => command);
  const asyncCommandNames = sendCommandAsync.mock.calls.map(([command]) => command);
  const setTracksIndex = commandNames.indexOf('setTracks');
  const playIndex = asyncCommandNames.indexOf('transport_play');
  expect(setTracksIndex).toBeGreaterThanOrEqual(0);
  expect(playIndex).toBeGreaterThanOrEqual(0);
  await waitFor(() => expect(useDAWStore.getState()).toMatchObject({
    isPlaying: true,
    playAwaitingEngine: false,
  }));
  expect(screen.getByRole('button', {name: 'Stop'})).toBeInTheDocument();
});

test('creates separate new tracks for multiple timeline-dropped audio files', async () => {
  const voiceTrack = trackFixture('track-voice', 'voice_audio');
  useDAWStore.setState({tracks: [voiceTrack]});
  render(<App />);

  await dropTimelineMedia([
    droppedFile('loop-a.wav', '/Users/me/loop-a.wav'),
    droppedFile('loop-b.wav', '/Users/me/loop-b.wav'),
    droppedFile('loop-c.wav', '/Users/me/loop-c.wav'),
  ], {rawBeat: 4.3});

  await waitFor(() => expect(importAudio).toHaveBeenCalledTimes(3));
  const state = useDAWStore.getState();
  const audioTracks = state.tracks.filter(track => track.type === 'voice_audio');
  expect(audioTracks).toHaveLength(4);
  expect(state.blocks).toHaveLength(3);
  expect(state.blocks.map(block => block.startBeat)).toEqual([4, 4, 4]);
  expect(state.blocks.map(block => block.trackId)).toEqual(audioTracks.slice(1).map(track => track.id));
  expect(state.blocks.map(block => block.audioFilePath)).toEqual([
    'imports/loop-a.wav',
    'imports/loop-b.wav',
    'imports/loop-c.wav',
  ]);
});

test('lets mixed timeline media drops fall back to the app-shell importer', async () => {
  const voiceTrack = trackFixture('track-voice', 'voice_audio');
  useDAWStore.setState({tracks: [voiceTrack]});
  render(<App />);

  await dropTimelineMedia([
    droppedFile('drop-loop.wav', '/Users/me/drop-loop.wav'),
    droppedFile('drop-lead.mid', '/Users/me/drop-lead.mid'),
  ], {rawBeat: 12.4});

  await waitFor(() => expect(importAudio).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(importMidi).toHaveBeenCalledTimes(1));
  expect(importAudio).toHaveBeenCalledWith({path: '/Users/me/drop-loop.wav'});
  expect(importMidi).toHaveBeenCalledWith({path: '/Users/me/drop-lead.mid'});
  const state = useDAWStore.getState();
  expect(state.blocks.find(block => block.type === 'audio')).toMatchObject({
    trackId: state.tracks[1]?.id,
    startBeat: 8,
    audioFilePath: 'imports/drop-loop.wav',
  });
  expect(state.blocks.find(block => block.type === 'midi')).toMatchObject({
    startBeat: 8,
    notes: [{note: 67, velocity: 100, startBeat: 0, lengthBeats: 2}],
  });
});

test('imports a dropped MIDI file and syncs the created track before the clip', async () => {
  render(<App />);

  await dropMedia(droppedFile('drop-lead.mid', '/Users/me/drop-lead.mid'));

  expect(importMidi).toHaveBeenCalledWith({path: '/Users/me/drop-lead.mid'});
  expect(importAudio).not.toHaveBeenCalled();
  const state = useDAWStore.getState();
  expect(state.tracks[0]).toMatchObject({type: 'software_instrument', name: 'Drop Lead'});
  expect(state.blocks[0]).toMatchObject({
    trackId: state.tracks[0]?.id,
    startBeat: 8,
    notes: [{note: 67, velocity: 100, startBeat: 0, lengthBeats: 2}],
  });
  await waitFor(() => {
    expect(sendCommand.mock.calls.some(([command]) => command === 'setTracks')).toBe(true);
    expect(sendCommand.mock.calls.some(([command]) => command === 'upsert_midi_clip')).toBe(true);
  });
  const setTracksIndex = sendCommand.mock.calls.findIndex(([command]) => command === 'setTracks');
  const upsertMidiIndex = sendCommand.mock.calls.findIndex(([command]) => command === 'upsert_midi_clip');
  expect(upsertMidiIndex).toBeGreaterThan(setTracksIndex);
});
