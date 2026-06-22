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

function audioTree(lengthBeats = 220): ApcAgentTree {
  return tree({
    'manifest.json': {format: 'apc', version: 1, trackIds: ['track-1'], clipIds: ['clip-1'], patternIds: []},
    'project.json': {bpm: 120},
    'timeline.json': {timeSignature: {numerator: 4, denominator: 4}, sections: []},
    'tracks/track-1.json': {id: 'track-1', name: 'Voice 1', type: 'voice_audio'},
    'clips/clip-1.json': {
      id: 'clip-1',
      name: 'Imported Song',
      type: 'audio',
      trackId: 'track-1',
      startBeat: 0,
      lengthBeats,
      audioFilePath: 'imports/song.mp3',
    },
  });
}

function sectionsFrom(result: NonNullable<ReturnType<typeof buildBlockStructureShortcut>>) {
  const change = result.patch.changes[0];
  return change.op === 'mergeFields'
    ? change.fields.sections as Array<{name: string; startBeat: number; lengthBeats: number}>
    : [];
}

describe('timeline metadata Build shortcuts', () => {
  it('adds a full arrangement map using displayed one-based bar labels', () => {
    const prompt = 'Add arrangement section markers only: Intro bars 1-6, Verse 1 bars 7-19, Chorus 1 bars 20-25, Verse 2 bars 26-35, Chorus 2 bars 36-45, Outro from bar 46 to the end of the song. Do not split, move, delete, mute, or change any clips.';
    const source = audioTree();
    const result = buildBlockStructureShortcut(prompt, source);

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(source, result!.patch)).toEqual([]);
    expect(result?.text).toBe('Prepared 6 arrangement section markers.');
    expect(result?.patch).toMatchObject({
      summary: 'Add 6 arrangement section markers',
      changes: [{op: 'mergeFields', path: 'timeline.json', beforeHash: 'h-timeline.json'}],
    });
    expect(result?.patch.changes).toHaveLength(1);
    expect(sectionsFrom(result!)).toEqual([
      expect.objectContaining({name: 'Intro', startBeat: 0, lengthBeats: 24}),
      expect.objectContaining({name: 'Verse 1', startBeat: 24, lengthBeats: 52}),
      expect.objectContaining({name: 'Chorus 1', startBeat: 76, lengthBeats: 24}),
      expect.objectContaining({name: 'Verse 2', startBeat: 100, lengthBeats: 40}),
      expect.objectContaining({name: 'Chorus 2', startBeat: 140, lengthBeats: 40}),
      expect.objectContaining({name: 'Outro', startBeat: 180, lengthBeats: 40}),
    ]);
  });

  it('treats bar 1 as the first displayed bar for a single section marker', () => {
    const source = audioTree(128);
    const result = buildBlockStructureShortcut('add an intro marker from bar 1 to bar 6', source);

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(source, result!.patch)).toEqual([]);
    expect(sectionsFrom(result!)).toContainEqual(expect.objectContaining({
      name: 'Intro',
      startBeat: 0,
      lengthBeats: 24,
    }));
  });
});
