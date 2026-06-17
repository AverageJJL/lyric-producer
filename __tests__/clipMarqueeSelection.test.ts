import {
  clipIdsInMarquee,
  commitMarqueeClipSelection,
} from '../src/arrangement/clipMarqueeSelection';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';

const tracks: DAWTrack[] = ['track-1', 'track-2'].map((id, index) => ({
  id,
  name: `Track ${index + 1}`,
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isRecordArmed: false,
  isLocked: false,
}));

function block(id: string, trackId: string, startBeat: number): DAWBlock {
  return {
    id,
    trackId,
    name: id,
    startBeat,
    lengthBeats: 4,
    type: 'midi',
    color: '#4a7fd4',
    notes: [],
  };
}

beforeEach(() => {
  useDAWStore.setState({
    tracks,
    blocks: [
      block('clip-a', 'track-1', 0),
      block('clip-b', 'track-2', 8),
    ],
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
  });
});

test('finds clips overlapping the marquee beat and row range', () => {
  const ids = clipIdsInMarquee(useDAWStore.getState().blocks, ['track-1', 'track-2'], {
    startBeat: 1,
    endBeat: 5,
    startRow: 0,
    endRow: 0,
  });

  expect(ids).toEqual(['clip-a']);
});

test('commits marquee selection without recording history', () => {
  commitMarqueeClipSelection(['clip-a']);

  expect(useDAWStore.getState()).toMatchObject({
    selectedBlockId: 'clip-a',
    selectedBlockIds: ['clip-a'],
    selectedTrackId: 'track-1',
  });
});

test('can add marquee hits to the existing clip selection', () => {
  commitMarqueeClipSelection(['clip-a']);
  commitMarqueeClipSelection(['clip-b'], true);

  expect(useDAWStore.getState()).toMatchObject({
    selectedBlockId: 'clip-b',
    selectedBlockIds: ['clip-a', 'clip-b'],
    selectedTrackId: 'track-2',
  });
});
