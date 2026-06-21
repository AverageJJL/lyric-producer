import React from 'react';
import {act, cleanup, render} from '@testing-library/react';

import {
  sendNativeAudioCommand,
  sendNativeAudioCommandAsync,
} from '../src/native/NativeAudioEngine';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {
  deferNextNativeBlockSyncForProjectOpen,
  useDAWNativeBridge,
} from '../src/store/useDAWNativeBridge';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => '{"ok":true}'),
  sendNativeAudioCommandAsync: jest.fn(() => Promise.resolve('{"ok":true}')),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;
const mockedSendAsync = sendNativeAudioCommandAsync as jest.MockedFunction<
  typeof sendNativeAudioCommandAsync
>;

function track(id: string, name: string): DAWTrack {
  return {
    id,
    name,
    isMuted: false,
    isSolo: false,
    type: 'software_instrument',
    instrumentId: 'synth_lead',
    presetId: 'pop_lead',
    isRecordArmed: false,
    isLocked: false,
  };
}

function midiBlock(trackId: string): DAWBlock {
  return {
    id: `clip-${trackId}`,
    trackId,
    name: 'Clip',
    startBeat: 0,
    lengthBeats: 4,
    type: 'midi',
    color: '#4a7fd4',
    notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
  };
}

function audioTrack(id: string, name: string): DAWTrack {
  return {
    id,
    name,
    isMuted: false,
    isSolo: false,
    type: 'voice_audio',
    instrumentId: 'voice_audio',
    presetId: 'voice_audio',
    isRecordArmed: false,
    isLocked: false,
  };
}

function audioBlock(id: string, trackId: string): DAWBlock {
  return {
    id,
    trackId,
    name: 'External Audio',
    startBeat: 0,
    lengthBeats: 248,
    type: 'audio',
    color: '#5a8cff',
    audioFilePath: 'imports/Frozen Hearts_bass-3.mp3',
    absoluteAudioFilePath:
      '/Users/jlang/Library/Application Support/MusicApp/assets/imports/Frozen Hearts_bass-3.mp3',
    sourceLengthBeats: 248,
    sourceOffsetBeats: 0,
  };
}

function NativeBridgeHarness(): null {
  useDAWNativeBridge();
  return null;
}

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [track('track-a', 'Alpha'), track('track-b', 'Beta')],
    patterns: {},
    blocks: [midiBlock('track-a'), midiBlock('track-b')],
    masterVolumeDb: 0,
    masterPan: 0,
    performanceMode: 'linear',
    looperLengthBars: 4,
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
    tempoMap: [],
    meterMap: [],
    scale: null,
    chord: null,
    sections: [],
    midiAudition: null,
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

describe('native bridge track ordering', () => {
  beforeEach(() => {
    resetStore();
    mockedSend.mockClear();
    mockedSendAsync.mockClear();
  });

  afterEach(() => {
    cleanup();
    mockedSend.mockReset();
    mockedSendAsync.mockReset();
  });

  it('re-upserts playable clips when the track order changes', () => {
    jest.useFakeTimers();
    try {
      render(<NativeBridgeHarness />);
      mockedSend.mockClear();

      act(() => {
        useDAWStore.getState().moveTrack('track-b', -1);
      });

      act(() => {
        jest.advanceTimersByTime(40);
      });

      const setTracksIndex = mockedSend.mock.calls.findIndex(([command]) => command === 'setTracks');
      const upsertCalls = mockedSend.mock.calls
        .map(([command, payload], index) => ({command, payload, index}))
        .filter(call => call.command === 'upsert_midi_clip');

      expect(setTracksIndex).toBeGreaterThanOrEqual(0);
      expect(upsertCalls.map(call => call.payload)).toEqual([
        expect.objectContaining({clipId: 'clip-track-a', trackId: 'track-a'}),
        expect.objectContaining({clipId: 'clip-track-b', trackId: 'track-b'}),
      ]);
      expect(upsertCalls.every(call => call.index > setTracksIndex)).toBe(true);
    } finally {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    }
  });

  it('does not re-upsert existing clips when a track is appended', () => {
    jest.useFakeTimers();
    try {
      render(<NativeBridgeHarness />);
      mockedSend.mockClear();

      act(() => {
        useDAWStore.getState().addTrackWithBlock(track('track-c', 'Gamma'), midiBlock('track-c'));
      });

      act(() => {
        jest.advanceTimersByTime(40);
      });

      const upsertCalls = mockedSend.mock.calls
        .map(([command, payload]) => ({command, payload}))
        .filter(call => call.command === 'upsert_midi_clip');

      expect(upsertCalls.map(call => call.payload)).toEqual([
        expect.objectContaining({clipId: 'clip-track-c', trackId: 'track-c'}),
      ]);
    } finally {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    }
  });

  it('splits delayed dirty block upserts across timer turns', () => {
    jest.useFakeTimers();
    try {
      render(<NativeBridgeHarness />);
      mockedSend.mockClear();

      act(() => {
        useDAWStore.setState(state => ({
          blocks: state.blocks.map((block, index) => ({
            ...block,
            notes: block.notes?.map(note => ({
              ...note,
              velocity: note.velocity - index - 1,
            })),
          })),
          syncSource: 'ui',
        }));
      });

      const upsertCount = () =>
        mockedSend.mock.calls.filter(([command]) => command === 'upsert_midi_clip').length;

      expect(upsertCount()).toBe(0);

      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(upsertCount()).toBe(1);

      act(() => {
        jest.advanceTimersByTime(15);
      });
      expect(upsertCount()).toBe(1);

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(upsertCount()).toBe(2);
    } finally {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    }
  });

  it('keeps compressed project-open audio out of the native play path', async () => {
    jest.useFakeTimers();
    try {
      render(<NativeBridgeHarness />);
      mockedSend.mockClear();

      const clearUnusedDeferral = deferNextNativeBlockSyncForProjectOpen();
      act(() => {
        useDAWStore.setState({
          tracks: [audioTrack('track-audio', 'Audio')],
          blocks: [audioBlock('clip-audio', 'track-audio')],
          syncSource: 'ui',
        });
      });
      clearUnusedDeferral();

      act(() => {
        jest.advanceTimersByTime(250);
      });
      expect(mockedSend.mock.calls.map(([command]) => command)).not.toContain(
        'upsert_audio_clip',
      );

      await act(async () => {
        useDAWStore.setState({
          isPlaying: true,
          playheadBeat: 0,
          playheadSeconds: 0,
        });
        await Promise.resolve();
      });

      let commandNames = mockedSend.mock.calls.map(([command]) => command);
      expect(mockedSendAsync.mock.calls.map(([command]) => command)).toContain('transport_play');
      expect(commandNames).not.toContain('upsert_audio_clip');

      commandNames = mockedSend.mock.calls.map(([command]) => command);
      const asyncCommandNames = mockedSendAsync.mock.calls.map(([command]) => command);
      const transportIndex = asyncCommandNames.indexOf('transport_play');
      const upsertIndex = asyncCommandNames.indexOf('upsert_audio_clip');
      expect(transportIndex).toBeGreaterThanOrEqual(0);
      expect(upsertIndex).toBe(-1);
      expect(commandNames).not.toContain('upsert_audio_clip');
    } finally {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    }
  });
});
