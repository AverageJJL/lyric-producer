import React from 'react';
import {act, cleanup, render} from '@testing-library/react';

import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWNativeBridge} from '../src/store/useDAWNativeBridge';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => '{"ok":true}'),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;

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
  });

  afterEach(() => {
    cleanup();
    mockedSend.mockReset();
  });

  it('re-upserts playable clips when the track order changes', () => {
    render(<NativeBridgeHarness />);
    mockedSend.mockClear();

    act(() => {
      useDAWStore.getState().moveTrack('track-b', -1);
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
  });
});
