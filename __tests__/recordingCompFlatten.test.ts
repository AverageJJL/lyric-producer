import {flattenRecordingCompGroupInPlace} from '../src/arrangement/recordingCompFlatten';
import type {DAWBlock} from '../src/store/useDAWStore';
import {useDAWStore} from '../src/store/useDAWStore';

const groupId = 'loop:voice:clip';

function compOutput(id: string, startBeat: number, lengthBeats: number): DAWBlock {
  return {
    id,
    trackId: 'voice',
    name: 'Comp',
    startBeat,
    lengthBeats,
    type: 'audio',
    color: '#5588ff',
    audioFilePath: 'recordings/take.wav',
    absoluteAudioFilePath: '/tmp/take.wav',
    sourceOffsetBeats: startBeat - 4,
    sourceLengthBeats: 4,
    recordingCompGroupId: groupId,
    recordingCompSourceTakeId: 'take-a',
    recordingCompSegmentId: `${id}:segment`,
  };
}

describe('recording comp flatten', () => {
  beforeEach(() => {
    useDAWStore.setState({
      blocks: [],
      selectedBlockId: null,
      selectedBlockIds: [],
      selectedTrackId: null,
      syncSource: 'ui',
    });
  });

  it('flattens a single-slice comp without invoking native render destination', async () => {
    const prepareAudioRender = jest.fn();
    useDAWStore.setState({blocks: [compOutput('comp-a', 4, 4)]});

    const result = await flattenRecordingCompGroupInPlace(groupId, {prepareAudioRender});
    const blocks = useDAWStore.getState().blocks;

    expect(result.ok).toBe(true);
    expect(prepareAudioRender).not.toHaveBeenCalled();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      name: 'Flattened Comp',
      recordingCompGroupId: undefined,
      recordingCompSegmentId: undefined,
      sourceOffsetBeats: 0,
      lengthBeats: 4,
    });
  });

  it('refuses multi-slice flatten without mutating the take folder', async () => {
    const original = [
      compOutput('comp-a', 4, 1),
      compOutput('comp-b', 5, 3),
    ];
    useDAWStore.setState({blocks: original});

    const result = await flattenRecordingCompGroupInPlace(groupId, null);

    expect(result).toEqual({
      ok: false,
      error: 'Flatten and Merge for edited multi-take comps is disabled until native slice rendering is hardened.',
    });
    expect(useDAWStore.getState().blocks).toEqual(original);
  });
});
