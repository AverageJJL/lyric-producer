import {buildBlockStructureShortcut} from '../electron/copilotBuildShortcuts';
import type {ApcAgentTree} from '../electron/copilotAgentTools';
import {validatePatchAgainstTree} from '../electron/copilotAgentTurn';

function tree(files: Record<string, unknown>): ApcAgentTree {
  const stringFiles: Record<string, string> = {};
  const index: ApcAgentTree['index'] = [];
  for (const [path, value] of Object.entries(files)) {
    const content = JSON.stringify(value);
    stringFiles[path] = content;
    index.push({path, bytes: content.length, contentHash: `h-${path}`});
  }
  return {fingerprint: 'fp', files: stringFiles, index};
}

function audioTree(): ApcAgentTree {
  return tree({
    'manifest.json': {format: 'apc', version: 1, trackIds: ['track-1'], clipIds: ['clip-1'], patternIds: []},
    'project.json': {bpm: 120},
    'timeline.json': {
      timeSignature: {numerator: 4, denominator: 4},
      sections: [{id: 'old', name: 'Existing', startBeat: 500, lengthBeats: 8}],
    },
    'tracks/track-1.json': {id: 'track-1', name: 'Voice 1', type: 'voice_audio'},
    'clips/clip-1.json': {
      id: 'clip-1',
      name: 'Imported Song',
      type: 'audio',
      trackId: 'track-1',
      startBeat: 0,
      lengthBeats: 128,
      audioFilePath: 'imports/song.mp3',
    },
  });
}

describe('buildBlockStructureShortcut', () => {
  it('stages visible audio slice blocks from an explicit no-generation Build request', () => {
    const result = buildBlockStructureShortcut(
      'Using only my existing audio, split the first 52 beats into an arrangement: intro 0-8, groove 8-24, breakdown 24-32, lift 32-44, outro 44-52. Create visible clip blocks and stage it.',
      audioTree(),
    );

    expect(result).not.toBeNull();
    expect(result?.text).toContain('guide slice blocks');
    expect(result?.text).toContain('no audio, MIDI, or new music is generated');
    expect(result?.patch).toMatchObject({
      baseFingerprint: 'fp',
      summary: 'Stage split arrangement from existing audio',
    });
    expect(result?.patch.changes[0]).toMatchObject({
      op: 'mergeFields',
      path: 'timeline.json',
      beforeHash: 'h-timeline.json',
    });
    expect(validatePatchAgainstTree(audioTree(), result!.patch)).toEqual([]);
    expect(result?.patch.changes).toHaveLength(7);
    expect(result?.patch.changes).toContainEqual({
      op: 'createFile',
      path: 'tracks/ai-build-slices-track-1.json',
      content: expect.stringContaining('"Build slices - Voice 1"'),
    });

    const created = result?.patch.changes
      .filter(change => change.op === 'createFile')
      .filter(change => change.path.startsWith('clips/'))
      .map(change => JSON.parse(change.content) as {
        name: string;
        trackId: string;
        startBeat: number;
        lengthBeats: number;
        sourceOffsetBeats: number;
        isMuted?: boolean;
      });
    expect(created).toHaveLength(5);
    expect(created?.[0]).toMatchObject({
      name: 'intro - Imported Song',
      trackId: 'ai-build-slices-track-1',
      startBeat: 0,
      lengthBeats: 8,
      sourceOffsetBeats: 0,
      isMuted: true,
    });
    const sections = result?.patch.changes[0].op === 'mergeFields'
      ? result.patch.changes[0].fields.sections as Array<{id: string; name: string}>
      : [];
    expect(sections.map(section => section.name)).toEqual([
      'Existing',
      'intro',
      'groove',
      'breakdown',
      'lift',
      'outro',
    ]);
  });

  it('can stage a dropout pass by splitting and reducing non-rhythm slices', () => {
    const result = buildBlockStructureShortcut(
      'Stage a vocal-space dropout between beats 16 and 32 using only the current audio block, no new music.',
      audioTree(),
    );

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(audioTree(), result!.patch)).toEqual([]);
    expect(result?.patch.summary).toBe('Stage split-and-dropout arrangement from existing audio');
    const created = result?.patch.changes
      .filter(change => change.op === 'createFile')
      .filter(change => change.path.startsWith('clips/'))
      .map(change => JSON.parse(change.content) as {name: string; clipGainDb?: number; isMuted?: boolean});
    expect(created?.some(clip => clip.name.includes('vocal space') && clip.clipGainDb === -10 && clip.isMuted === true)).toBe(true);
  });

  it('ignores non-structure prompts so the normal agent loop can handle them', () => {
    expect(buildBlockStructureShortcut('make the vocal louder', audioTree())).toBeNull();
  });
});
