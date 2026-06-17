import {buildTimelineDisplayLaneLayout, takeSidebarRowsForTrack} from '../src/ui/timelineDisplayLanes';
import type {DAWBlock, DAWTrack} from '../src/store/useDAWStore';

const track: DAWTrack = {
  id: 'track-voice',
  name: 'Voice',
  isMuted: false,
  isSolo: false,
  type: 'voice_audio',
  instrumentId: 'voice_audio',
  presetId: 'voice_audio',
  isRecordArmed: false,
  isLocked: false,
};

function take(id: string, index: number): DAWBlock {
  return {
    id,
    trackId: track.id,
    name: `Take ${index + 1}`,
    startBeat: 4,
    lengthBeats: 4,
    type: 'audio',
    color: '#7d5fff',
    recordingTakeGroupId: 'loop:track-voice:clip',
    recordingTakeId: id,
    recordingTakeIndex: index,
    recordingTakeActive: false,
  };
}

describe('timeline take-folder display rows', () => {
  it('inserts full-height virtual take lanes under the parent track', () => {
    const blocks: DAWBlock[] = [
      take('take-a', 0),
      take('take-b', 1),
      {
        ...take('comp-a', 0),
        id: 'comp-output',
        name: 'Comp',
        recordingTakeGroupId: undefined,
        recordingTakeId: undefined,
        recordingTakeIndex: undefined,
        recordingCompGroupId: 'loop:track-voice:clip',
      },
    ];

    const layout = buildTimelineDisplayLaneLayout(
      [track],
      blocks,
      ['loop:track-voice:clip'],
      128,
    );

    expect(layout.lanes.map(lane => ({kind: lane.kind, height: lane.height, offsetTop: lane.offsetTop})))
      .toEqual([
        {kind: 'track', height: 128, offsetTop: 0},
        {kind: 'take', height: 128, offsetTop: 128},
        {kind: 'take', height: 128, offsetTop: 256},
      ]);
    expect(takeSidebarRowsForTrack(blocks, track.id, ['loop:track-voice:clip']))
      .toHaveLength(2);
  });
});
