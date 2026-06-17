import React from 'react';
import {act, cleanup, render, screen} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {App} from '../src/web/App';

const sendCommand = jest.fn();

const track: DAWTrack = {
  id: 'track-1',
  name: 'Keys',
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isRecordArmed: false,
  isLocked: false,
};

function clip(updates?: Partial<DAWBlock>): DAWBlock {
  return {
    id: 'clip-1',
    trackId: track.id,
    name: 'Lead',
    startBeat: 0,
    lengthBeats: 4,
    type: 'midi',
    color: '#4a7fd4',
    notes: [],
    ...updates,
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
    masterVolumeDb: 0,
    masterPan: 0,
    isRelativeSnapEnabled: false,
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
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
});

test('does not expose broken arranger section duplicate from the marker lane', () => {
  act(() => {
    useDAWStore.setState({
      tracks: [track],
      blocks: [clip()],
      sections: [{id: 'verse', name: 'Verse', startBeat: 0, lengthBeats: 4}],
    });
  });
  render(<App />);

  expect(screen.queryByLabelText('Duplicate section Verse')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Split section Verse')).toBeInTheDocument();
});
