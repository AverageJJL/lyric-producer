import {
  defaultCompSegmentsForGroup,
  duplicateRecordingCompVersionBlocks,
  fullTakeCompSegmentsForGroup,
  materializeRecordingCompOutput,
  replaceCompRange,
  switchRecordingCompVersionBlocks,
} from '../src/transport/recordingComp';
import type {DAWBlock} from '../src/store/useDAWStore';

function take(id: string, index: number, sourceOffsetBeats: number): DAWBlock {
  return {
    id,
    trackId: 'track-voice',
    name: `Take ${index + 1}`,
    startBeat: 4,
    lengthBeats: 4,
    type: 'audio',
    color: '#5588ff',
    audioFilePath: 'recordings/take.wav',
    absoluteAudioFilePath: '/tmp/take.wav',
    sourceLengthBeats: 8,
    sourceOffsetBeats,
    recordingTakeGroupId: 'loop:track-voice:clip',
    recordingTakeId: id,
    recordingTakeIndex: index,
    recordingTakeActive: false,
  };
}

describe('recording comp output', () => {
  it('quick-swipe replacement splits output slices and preserves source offsets', () => {
    const blocks = [
      take('take-a', 0, 0),
      take('take-b', 1, 4),
    ];
    const fullTakeA = replaceCompRange(blocks, 'loop:track-voice:clip', 'take-a', 4, 8);
    const segments = replaceCompRange(
      materializeRecordingCompOutput(blocks, 'loop:track-voice:clip', fullTakeA),
      'loop:track-voice:clip',
      'take-b',
      5,
      7,
    );
    const output = materializeRecordingCompOutput(blocks, 'loop:track-voice:clip', segments);
    const compBlocks = output.filter(block => block.recordingCompGroupId);

    expect(output.filter(block => block.recordingTakeGroupId).every(block =>
      block.recordingTakeActive === false,
    )).toBe(true);
    expect(compBlocks.map(block => ({
      sourceTake: block.recordingCompSourceTakeId,
      startBeat: block.startBeat,
      lengthBeats: block.lengthBeats,
      sourceOffsetBeats: block.sourceOffsetBeats,
      fadeInBeats: block.fadeInBeats,
      fadeOutBeats: block.fadeOutBeats,
    }))).toEqual([
      {
        sourceTake: 'take-a',
        startBeat: 4,
        lengthBeats: 1,
        sourceOffsetBeats: 0,
        fadeInBeats: undefined,
        fadeOutBeats: 0.05,
      },
      {
        sourceTake: 'take-b',
        startBeat: 5,
        lengthBeats: 2,
        sourceOffsetBeats: 5,
        fadeInBeats: 0.05,
        fadeOutBeats: 0.05,
      },
      {
        sourceTake: 'take-a',
        startBeat: 7,
        lengthBeats: 1,
        sourceOffsetBeats: 3,
        fadeInBeats: 0.05,
        fadeOutBeats: undefined,
      },
    ]);
  });

  it('duplicates and switches comp versions without mutating source takes', () => {
    const blocks = [
      take('take-a', 0, 0),
      take('take-b', 1, 4),
    ];
    const groupId = 'loop:track-voice:clip';
    const compA = materializeRecordingCompOutput(
      blocks,
      groupId,
      replaceCompRange(blocks, groupId, 'take-a', 4, 8),
    );
    const duplicated = duplicateRecordingCompVersionBlocks(compA, groupId);
    const activeVersionId = duplicated.find(block => block.recordingCompGroupId)
      ?.activeRecordingCompVersionId;
    const compB = materializeRecordingCompOutput(
      duplicated,
      groupId,
      replaceCompRange(duplicated, groupId, 'take-b', 5, 7),
    );

    expect(compB.find(block => block.recordingCompGroupId)?.recordingCompVersions?.map(version => version.name))
      .toEqual(['Comp A', 'Comp B']);
    expect(compB.filter(block => block.recordingCompGroupId).map(block => block.recordingCompSourceTakeId))
      .toEqual(['take-a', 'take-b', 'take-a']);

    const compAId = compB.find(block => block.recordingCompGroupId)
      ?.recordingCompVersions?.[0]?.id;
    const switched = switchRecordingCompVersionBlocks(compB, groupId, compAId ?? '');

    expect(activeVersionId).toBeTruthy();
    expect(switched.filter(block => block.recordingCompGroupId).map(block => block.recordingCompSourceTakeId))
      .toEqual(['take-a']);
    expect(switched.filter(block => block.recordingTakeGroupId).every(block =>
      block.recordingTakeActive === false,
    )).toBe(true);
  });

  it('fills a short final take with the newest previous take tail', () => {
    const blocks = [
      take('take-a', 0, 0),
      take('take-b', 1, 4),
      {...take('take-c', 2, 8), lengthBeats: 1.5},
    ];

    expect(defaultCompSegmentsForGroup(blocks, 'loop:track-voice:clip').map(segment => ({
      takeId: segment.takeId,
      startBeat: segment.startBeat,
      endBeat: segment.endBeat,
    }))).toEqual([
      {takeId: 'take-c', startBeat: 4, endBeat: 5.5},
      {takeId: 'take-b', startBeat: 5.5, endBeat: 8},
    ]);
  });

  it('selecting a short full take also preserves folder tail coverage', () => {
    const blocks = [
      take('take-a', 0, 0),
      take('take-b', 1, 4),
      {...take('take-c', 2, 8), lengthBeats: 1.5},
    ];

    expect(fullTakeCompSegmentsForGroup(blocks, 'loop:track-voice:clip', 'take-c').map(segment => ({
      takeId: segment.takeId,
      startBeat: segment.startBeat,
      endBeat: segment.endBeat,
    }))).toEqual([
      {takeId: 'take-c', startBeat: 4, endBeat: 5.5},
      {takeId: 'take-b', startBeat: 5.5, endBeat: 8},
    ]);
  });
});
