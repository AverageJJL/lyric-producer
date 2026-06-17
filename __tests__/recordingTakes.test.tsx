import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import {createProjectDocument, openProjectDocument} from '../src/arrangement/projectDocument';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {recordingTakeGroups} from '../src/transport/recordingTakes';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {
  useDAWStore,
  type DAWBlock,
  type DAWTrack,
  type RecordingFinalizePayload,
} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {RecordingTakesPanel} from '../src/web/components/RecordingTakesPanel';

const voiceTrack: DAWTrack = {
  id: 'track-voice',
  name: 'Voice',
  isMuted: false,
  isSolo: false,
  type: 'voice_audio',
  instrumentId: 'voice_audio',
  presetId: 'voice_audio',
  isRecordArmed: true,
  isLocked: false,
};

const synthTrack: DAWTrack = {
  id: 'track-synth',
  name: 'Synth',
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isRecordArmed: true,
  isLocked: false,
};

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    recordingCountInBeats: 0,
    recordingPreRollBeats: 0,
    isPunchRecordingEnabled: false,
    isLoopRecordingEnabled: false,
    recordingLatencyCompensationMs: 0,
    tracks: [voiceTrack],
    patterns: {},
    blocks: [],
    masterVolumeDb: 0,
    masterPan: 0,
    snapGrid: DEFAULT_SNAP_GRID,
    isRelativeSnapEnabled: false,
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
    scale: null,
    chord: null,
    sections: [],
    midiAudition: null,
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

function finishAudioTake(
  startBeat: number,
  name: string,
  extraPayload: Partial<RecordingFinalizePayload> = {},
): string {
  const clipId = useDAWStore.getState().startRecordingSession(voiceTrack.id, startBeat)!;
  useDAWStore.getState().finalizeRecordingSession({
    audioFilePath: `imports/${name}.wav`,
    absoluteAudioFilePath: `/tmp/${name}.wav`,
    lengthBeats: 4,
    durationSeconds: 2,
    ...extraPayload,
  });
  return clipId;
}

function takeBlock(id: string, takeIndex: number, isMuted?: boolean): DAWBlock {
  return {
    id,
    trackId: voiceTrack.id,
    name: 'Recorded',
    startBeat: 4,
    lengthBeats: 4,
    type: 'audio',
    color: '#888',
    audioFilePath: `imports/${id}.wav`,
    absoluteAudioFilePath: `/tmp/${id}.wav`,
    recordingTakeGroupId: 'take:track-voice:group',
    recordingTakeId: id,
    recordingTakeIndex: takeIndex,
    isMuted,
  };
}

describe('recording takes', () => {
  beforeEach(() => {
    resetStore();
  });

  it('preserves overlapping linear recordings as compable takes', () => {
    const firstId = finishAudioTake(4, 'take-a');
    const secondId = finishAudioTake(4, 'take-b');
    const blocks = useDAWStore.getState().blocks;
    const first = blocks.find(block => block.id === firstId);
    const second = blocks.find(block => block.id === secondId);

    expect(first).toMatchObject({recordingTakeIndex: 0, recordingTakeActive: false});
    expect(second).toMatchObject({
      recordingTakeGroupId: first?.recordingTakeGroupId,
      recordingTakeIndex: 1,
    });
    expect(second?.recordingTakeActive).toBe(true);
    expect(recordingTakeGroups(blocks)[0]?.takes).toHaveLength(2);

    useDAWStore.getState().compRecordingTake(firstId);
    expect(useDAWStore.getState().blocks.find(block => block.id === firstId)?.recordingTakeActive)
      .toBe(false);
    expect(useDAWStore.getState().blocks.find(block => block.id === secondId)?.recordingTakeActive)
      .toBe(false);
    expect(useDAWStore.getState().blocks.some(block =>
      block.recordingCompSourceTakeId === firstId &&
      block.recordingCompGroupId === first?.recordingTakeGroupId,
    )).toBe(true);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks.find(block => block.id === firstId)?.recordingTakeActive)
      .toBe(false);
  });

  it('applies manual latency compensation to finalized linear recordings', () => {
    useDAWStore.getState().setRecordingLatencyCompensationMs(50);

    const clipId = finishAudioTake(4, 'latency-take');
    const block = useDAWStore.getState().blocks.find(item => item.id === clipId);

    expect(block?.startBeat).toBeCloseTo(3.9);
    expect(block?.recordingLatencyCompensationMs).toBe(50);
    expect(block?.recordingLatencyCompensationBeats).toBeCloseTo(0.1);
    expect(block?.lengthBeats).toBe(4);
  });

  it('applies automatic native latency compensation to finalized linear recordings', () => {
    useDAWStore.getState().setRecordingLatencyCompensationMs(-1);

    const clipId = finishAudioTake(4, 'native-latency-take', {
      nativeInputLatencyMs: 12.5,
      nativeOutputLatencyMs: 37.5,
    });
    const block = useDAWStore.getState().blocks.find(item => item.id === clipId);

    expect(block?.startBeat).toBeCloseTo(3.9);
    expect(block?.recordingLatencyCompensationMs).toBe(50);
    expect(block?.recordingLatencyCompensationBeats).toBeCloseTo(0.1);
    expect(block?.recordingLatencyCompensationSource).toBe('native');
    expect(block?.recordingNativeInputLatencyMs).toBe(12.5);
    expect(block?.recordingNativeOutputLatencyMs).toBe(37.5);
  });

  it('finalizes MIDI loop recording passes as compable takes', () => {
    useDAWStore.setState({
      tracks: [synthTrack],
      isLoopRecordingEnabled: true,
      cycleStartBeat: 4,
      cycleEndBeat: 8,
    });

    const clipId = useDAWStore.getState().startRecordingSession(synthTrack.id, 4)!;
    useDAWStore.getState().finalizeRecordingSession([
      {note: 60, velocity: 100, startBeat: 0.5, lengthBeats: 0.5},
      {note: 64, velocity: 94, startBeat: 4.5, lengthBeats: 0.5},
    ]);

    const blocks = useDAWStore.getState().blocks;
    const group = recordingTakeGroups(blocks)[0];
    expect(blocks.map(block => block.id)).toEqual([clipId, `${clipId}-loop-2`]);
    expect(group?.takes.map(take => ({
      blockId: take.blockId,
      takeIndex: take.takeIndex,
      isActive: take.isActive,
    }))).toEqual([
      {blockId: clipId, takeIndex: 0, isActive: false},
      {blockId: `${clipId}-loop-2`, takeIndex: 1, isActive: true},
    ]);
    expect(blocks.map(block => block.startBeat)).toEqual([4, 4]);
    expect(blocks.map(block => block.lengthBeats)).toEqual([4, 4]);
  });

  it('finalizes audio loop recording passes as source-offset takes', () => {
    useDAWStore.setState({
      isLoopRecordingEnabled: true,
      cycleStartBeat: 4,
      cycleEndBeat: 8,
    });

    const clipId = useDAWStore.getState().startRecordingSession(voiceTrack.id, 4)!;
    useDAWStore.getState().finalizeRecordingSession({
      audioFilePath: 'recordings/loop.wav',
      absoluteAudioFilePath: '/tmp/loop.wav',
      lengthBeats: 10,
      durationSeconds: 5,
    });

    const blocks = useDAWStore.getState().blocks;
    expect(recordingTakeGroups(blocks)[0]?.takes).toHaveLength(3);
    expect(blocks.map(block => ({
      id: block.id,
      startBeat: block.startBeat,
      lengthBeats: block.lengthBeats,
      sourceOffsetBeats: block.sourceOffsetBeats,
      recordingTakeActive: block.recordingTakeActive,
      recordingCompGroupId: block.recordingCompGroupId,
    }))).toEqual([
      {
        id: clipId,
        startBeat: 4,
        lengthBeats: 4,
        sourceOffsetBeats: 0,
        recordingTakeActive: false,
        recordingCompGroupId: undefined,
      },
      {
        id: `${clipId}-loop-2`,
        startBeat: 4,
        lengthBeats: 4,
        sourceOffsetBeats: 4,
        recordingTakeActive: false,
        recordingCompGroupId: undefined,
      },
      {
        id: `${clipId}-loop-3`,
        startBeat: 4,
        lengthBeats: 2,
        sourceOffsetBeats: 8,
        recordingTakeActive: false,
        recordingCompGroupId: undefined,
      },
      {
        id: `loop:track-voice:${clipId}:comp:${clipId}-loop-3:4:6`,
        startBeat: 4,
        lengthBeats: 2,
        sourceOffsetBeats: 8,
        recordingTakeActive: undefined,
        recordingCompGroupId: `loop:track-voice:${clipId}`,
      },
      {
        id: `loop:track-voice:${clipId}:comp:${clipId}-loop-2:6:8`,
        startBeat: 6,
        lengthBeats: 2,
        sourceOffsetBeats: 6,
        recordingTakeActive: undefined,
        recordingCompGroupId: `loop:track-voice:${clipId}`,
      },
    ]);
  });

  it('renders take comp and select controls', () => {
    const onCompTake = jest.fn();
    const onSelectBlock = jest.fn();
    render(
      <RecordingTakesPanel
        blocks={[takeBlock('take-a', 0), takeBlock('take-b', 1, true)]}
        tracks={[voiceTrack]}
        onCompTake={onCompTake}
        onSelectBlock={onSelectBlock}
      />,
    );

    expect(screen.getByRole('region', {name: 'Recording takes'})).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', {name: 'Comp'})[1]!);
    fireEvent.click(screen.getByRole('button', {name: 'Select Take 2'}));

    expect(onCompTake).toHaveBeenCalledWith('take-b');
    expect(onSelectBlock).toHaveBeenCalledWith('take-b');
  });

  it('persists take grouping through project documents', () => {
    finishAudioTake(4, 'take-a');
    finishAudioTake(4, 'take-b');
    const before = recordingTakeGroups(useDAWStore.getState().blocks)[0];
    expect(before?.takes).toHaveLength(2);

    const document = createProjectDocument(captureProjectSnapshot(), '2026-06-03T12:00:00.000Z');
    resetStore();
    openProjectDocument(document, {skipNativeRefresh: true});

    const after = recordingTakeGroups(useDAWStore.getState().blocks)[0];
    expect(after?.groupId).toBe(before?.groupId);
    expect(after?.takes.map(take => take.isActive)).toEqual([false, true]);
  });
});
