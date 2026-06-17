import {displayTimelineBlocks} from '../src/web/components/timelineDisplayBlocks';
import {
  defaultCompSegmentsForGroup,
  materializeRecordingCompOutput,
} from '../src/transport/recordingComp';
import type {DAWBlock, DAWTrack} from '../src/store/useDAWStore';

const groupId = 'loop:voice:clip';

function audioTake(id: string, index: number, lengthBeats = 4): DAWBlock {
  return {
    id,
    trackId: 'voice',
    name: 'Loop Take',
    startBeat: 4,
    lengthBeats,
    type: 'audio',
    color: '#5588ff',
    audioFilePath: `recordings/${id}.wav`,
    absoluteAudioFilePath: `/tmp/${id}.wav`,
    sourceLengthBeats: 12,
    sourceOffsetBeats: index * 4,
    waveformPeaks: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 0.8, 0.6],
    recordingTakeGroupId: groupId,
    recordingTakeId: id,
    recordingTakeIndex: index,
    recordingTakeActive: false,
  };
}

const tracks: DAWTrack[] = [{
  id: 'voice',
  name: 'Voice',
  type: 'voice_audio',
  instrumentId: 'voice',
  presetId: 'voice',
  volumeDb: 0,
  pan: 0,
  isMuted: false,
  isSolo: false,
  isRecordArmed: true,
  isLocked: false,
}];

describe('timeline comp display blocks', () => {
  it('renders one folder shell while keeping source takes full-cycle visually aligned', () => {
    const takes = [
      audioTake('take-a', 0),
      audioTake('take-b', 1),
      audioTake('take-c', 2, 1.5),
    ];
    const blocks = materializeRecordingCompOutput(
      takes,
      groupId,
      defaultCompSegmentsForGroup(takes, groupId),
    );

    const display = displayTimelineBlocks({
      blocks,
      tracks,
      liveMidiPreviewByTrack: {},
      isRecording: false,
      playheadBeat: 4,
    });

    const folderShells = display.filter(block => block.isRecordingCompDisplayBlock);
    const nativeCompOutputs = display.filter(block =>
      block.recordingCompGroupId && !block.isRecordingCompDisplayBlock,
    );
    const shortTake = display.find(block => block.id === 'take-c');

    expect(folderShells).toHaveLength(1);
    expect(folderShells[0]).toMatchObject({
      recordingCompGroupId: groupId,
      startBeat: 4,
      lengthBeats: 4,
      sourceOffsetBeats: 0,
    });
    expect(folderShells[0]?.waveformPeaks).toEqual([0.9, 1, 0.6, 0.7, 0.8]);
    expect(nativeCompOutputs).toHaveLength(0);
    expect(shortTake).toMatchObject({
      startBeat: 4,
      lengthBeats: 4,
    });
  });
});
