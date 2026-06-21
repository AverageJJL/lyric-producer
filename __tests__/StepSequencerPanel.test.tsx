import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';

import {
  sendNativeAudioCommand,
  sendNativeAudioCommandAsync,
} from '../src/native/NativeAudioEngine';
import {createEmptyPattern} from '../src/music/drumPatterns';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {StepSequencerPanel} from '../src/web/components/StepSequencerPanel';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => '{"ok":true}'),
  sendNativeAudioCommandAsync: jest.fn(() => Promise.resolve('{"ok":true}')),
}));

jest.mock('../src/native/NativeAudioEngineEvents', () => ({
  DRUM_PATTERN_STEP_EVENT: 'drum-pattern-step',
  createNativeAudioEngineEventEmitter: jest.fn(() => null),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;
const mockedSendAsync = sendNativeAudioCommandAsync as jest.MockedFunction<
  typeof sendNativeAudioCommandAsync
>;

const drumTrack: DAWTrack = {
  id: 'track-drums',
  name: 'Drums',
  isMuted: false,
  isSolo: false,
  type: 'drum_machine',
  instrumentId: 'drum_machine_pop',
  presetId: 'pop_basic',
  isRecordArmed: false,
  isLocked: false,
};

const pattern = createEmptyPattern('Pattern A', 'pattern-a');

const patternBlock: DAWBlock = {
  id: 'clip-pattern-a',
  trackId: drumTrack.id,
  name: 'Pattern A',
  startBeat: 0,
  lengthBeats: 4,
  type: 'audio',
  color: '#4a7fd4',
  patternId: pattern.id,
  sourceLengthBeats: 4,
  sourceOffsetBeats: 0,
};

function resetStore(blocks: DAWBlock[] = [], patterns = {}): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [drumTrack],
    patterns,
    blocks,
    masterVolumeDb: 0,
    masterPan: 0,
    performanceMode: 'linear',
    looperLengthBars: 4,
    isCycleEnabled: false,
    cycleStartBeat: 0,
    cycleEndBeat: 4,
    selectedBlockId: blocks[0]?.id ?? null,
    selectedBlockIds: blocks[0] ? [blocks[0].id] : [],
    selectedTrackId: drumTrack.id,
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

describe('StepSequencerPanel', () => {
  beforeEach(() => {
    mockedSend.mockClear();
    mockedSendAsync.mockClear();
  });

  it('keeps hook order stable when a drum clip becomes selected', () => {
    resetStore();
    const {rerender} = render(<StepSequencerPanel track={drumTrack} selectedBlockId={null} />);
    expect(screen.getByText('Select a drum pattern clip on the timeline.')).toBeInTheDocument();

    act(() => {
      resetStore([patternBlock], {[pattern.id]: pattern});
    });

    expect(() => {
      rerender(<StepSequencerPanel track={drumTrack} selectedBlockId={patternBlock.id} />);
    }).not.toThrow();
    expect(screen.getByText('Drum Machine')).toBeInTheDocument();
  });

  it('restores step edit sync after main transport stops local preview', () => {
    resetStore([patternBlock], {[pattern.id]: pattern});
    const {container} = render(<StepSequencerPanel track={drumTrack} selectedBlockId={patternBlock.id} />);

    fireEvent.click(screen.getByRole('button', {name: 'Play'}));
    expect(mockedSendAsync).toHaveBeenCalledWith('start_pattern_preview', expect.any(Object));

    act(() => {
      useDAWStore.setState({isPlaying: true, syncSource: 'ui'});
    });

    expect(screen.getByRole('button', {name: 'Play'})).toBeInTheDocument();
    mockedSend.mockClear();

    const firstStep = container.querySelector('.step-cell');
    expect(firstStep).not.toBeNull();
    fireEvent.click(firstStep as Element);

    expect(mockedSend).toHaveBeenCalledWith('set_drum_pattern_step', expect.objectContaining({
      clipId: patternBlock.id,
      trackId: drumTrack.id,
      sampleKey: 'kick',
      step: 0,
      active: true,
    }));
  });
});
