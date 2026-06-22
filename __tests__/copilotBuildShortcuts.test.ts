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
  it('adds a named section marker from a bar range without asking the model', () => {
    const result = buildBlockStructureShortcut('add a intro marker from bar 0 to 6', audioTree());

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(audioTree(), result!.patch)).toEqual([]);
    expect(result?.patch.changes).toHaveLength(1);
    expect(result?.patch.changes[0]).toMatchObject({
      op: 'mergeFields',
      path: 'timeline.json',
      beforeHash: 'h-timeline.json',
    });
    const sections = result?.patch.changes[0].op === 'mergeFields'
      ? result.patch.changes[0].fields.sections as Array<{name: string; startBeat: number; lengthBeats: number}>
      : [];
    expect(sections).toContainEqual(expect.objectContaining({
      name: 'Intro',
      startBeat: 0,
      lengthBeats: 24,
    }));
  });

  it('uses recent marker clarification history to complete the edit', () => {
    const result = buildBlockStructureShortcut('Intro', audioTree(), [
      {role: 'user', content: 'add a marker from bar 0 to 6'},
      {role: 'assistant', content: 'Should that be a section marker, and what should it be called?'},
    ]);

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(audioTree(), result!.patch)).toEqual([]);
    const sections = result?.patch.changes[0].op === 'mergeFields'
      ? result.patch.changes[0].fields.sections as Array<{name: string; startBeat: number; lengthBeats: number}>
      : [];
    expect(sections).toContainEqual(expect.objectContaining({
      name: 'Intro',
      startBeat: 0,
      lengthBeats: 24,
    }));
  });

  it('adds an estimated cycle over the main groove without confirmation', () => {
    const result = buildBlockStructureShortcut('where is the main groove and chorus? add a cycle range over it', audioTree());

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(audioTree(), result!.patch)).toEqual([]);
    expect(result?.text).toContain('estimated');
    expect(result?.patch.changes).toEqual([{
      op: 'mergeFields',
      path: 'project.json',
      beforeHash: 'h-project.json',
      fields: expect.objectContaining({
        isCycleEnabled: true,
        cycleStartBeat: expect.any(Number),
        cycleEndBeat: expect.any(Number),
      }),
    }]);
    const fields = result?.patch.changes[0].op === 'mergeFields'
      ? result.patch.changes[0].fields as {cycleStartBeat: number; cycleEndBeat: number}
      : {cycleStartBeat: 0, cycleEndBeat: 0};
    expect(fields.cycleEndBeat).toBeGreaterThan(fields.cycleStartBeat);
    expect(fields.cycleStartBeat % 4).toBe(0);
    expect(fields.cycleEndBeat % 4).toBe(0);
  });

  it('does not reuse an old marker range for a new chorus cycle request', () => {
    const result = buildBlockStructureShortcut(
      'Where is the main groove and chorus? Add a cycle range over it.',
      audioTree(),
      [
        {role: 'user', content: 'Add an Intro marker from bar 0 to 6.'},
        {role: 'assistant', content: 'Prepared a section marker named "Intro" from beat 0 to beat 24.'},
      ],
    );

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(audioTree(), result!.patch)).toEqual([]);
    expect(result?.patch.changes).toEqual([{
      op: 'mergeFields',
      path: 'project.json',
      beforeHash: 'h-project.json',
      fields: expect.objectContaining({
        isCycleEnabled: true,
        cycleStartBeat: expect.any(Number),
        cycleEndBeat: expect.any(Number),
      }),
    }]);
  });

  it('uses recent cycle confirmation history to complete the edit', () => {
    const result = buildBlockStructureShortcut('yes', audioTree(), [
      {role: 'user', content: 'find the chorus and add a cycle over it'},
      {role: 'assistant', content: 'Would you like me to set a cycle over the estimated chorus?'},
    ]);

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(audioTree(), result!.patch)).toEqual([]);
    expect(result?.patch.changes[0]).toMatchObject({
      op: 'mergeFields',
      path: 'project.json',
      beforeHash: 'h-project.json',
    });
  });

  it('does not let an old cycle proposal hijack a new non-cycle Build request', () => {
    const result = buildBlockStructureShortcut(
      'Make the hook feel bigger without adding new music. Use mutes, clip splits, and gain changes only.',
      audioTree(),
      [
        {role: 'user', content: 'find the chorus and add a cycle over it'},
        {role: 'assistant', content: 'Prepared an estimated cycle range from beat 52 to beat 116.'},
      ],
    );

    expect(result).not.toBeNull();
    expect(result?.text).toContain('split-and-dropout arrangement');
    expect(result?.patch.summary).toBe('Stage split-and-dropout arrangement from existing audio');
    expect(result?.patch.changes).not.toContainEqual(expect.objectContaining({
      path: 'project.json',
      fields: expect.objectContaining({isCycleEnabled: true}),
    }));
  });

  it('stages visible audio slice blocks from an explicit no-generation Build request', () => {
    const result = buildBlockStructureShortcut(
      'Using only my existing audio, split the first 52 beats into an arrangement: intro 0-8, groove 8-24, breakdown 24-32, lift 32-44, outro 44-52. Create visible clip blocks and stage it.',
      audioTree(),
    );

    expect(result).not.toBeNull();
    expect(result?.text).toContain('audible slice copies');
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
    expect(result?.patch.changes).toHaveLength(9);
    expect(result?.patch.changes).toContainEqual({
      op: 'createFile',
      path: 'tracks/ai-build-slices-track-1.json',
      content: expect.stringContaining('"Build slices - Voice 1"'),
    });
    expect(result?.patch.changes).toContainEqual({
      op: 'deleteFile',
      path: 'tracks/track-1.json',
      beforeHash: 'h-tracks/track-1.json',
    });
    expect(result?.patch.changes).toContainEqual({
      op: 'deleteFile',
      path: 'clips/clip-1.json',
      beforeHash: 'h-clips/clip-1.json',
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
      isMuted: false,
    });
    expect(created?.every(clip => clip.isMuted === false)).toBe(true);
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
      .map(change => JSON.parse(change.content) as {
        name: string;
        startBeat: number;
        lengthBeats: number;
        clipGainDb?: number;
        isMuted?: boolean;
      });
    expect(created?.some(clip => clip.name.includes('vocal space') && clip.clipGainDb === -10 && clip.isMuted === false)).toBe(true);
  });

  it('keeps a hook build on the full song range and removes source tracks on accept', () => {
    const result = buildBlockStructureShortcut(
      'Make the hook feel bigger without adding new music. Use mutes, clip splits, and gain changes only.',
      audioTree(),
    );

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(audioTree(), result!.patch)).toEqual([]);
    const sections = result?.patch.changes[0].op === 'mergeFields'
      ? result.patch.changes[0].fields.sections as Array<{id: string; startBeat: number; lengthBeats: number}>
      : [];
    const buildSections = sections.filter(section => section.id.startsWith('ai-build-'));
    const lastSection = buildSections[buildSections.length - 1]!;
    expect(lastSection.startBeat + lastSection.lengthBeats).toBe(128);
    expect(result?.patch.changes).toContainEqual({
      op: 'deleteFile',
      path: 'tracks/track-1.json',
      beforeHash: 'h-tracks/track-1.json',
    });
    expect(result?.patch.changes).toContainEqual({
      op: 'deleteFile',
      path: 'clips/clip-1.json',
      beforeHash: 'h-clips/clip-1.json',
    });
    const created = result?.patch.changes
      .filter(change => change.op === 'createFile')
      .filter(change => change.path.startsWith('clips/'))
      .map(change => JSON.parse(change.content) as {name: string; clipGainDb?: number; isMuted?: boolean});
    expect(created).toHaveLength(3);
    expect(created?.every(clip => clip.isMuted === false)).toBe(true);
    expect(created?.some(clip => clip.name.includes('Groove vocal space') && clip.clipGainDb === -10)).toBe(true);
    expect(created?.[0]).toMatchObject({startBeat: 0, lengthBeats: 52});
    expect(created?.[2]).toMatchObject({startBeat: 76, lengthBeats: 52});
  });

  it('ignores non-structure prompts so the normal agent loop can handle them', () => {
    expect(buildBlockStructureShortcut('make the vocal louder', audioTree())).toBeNull();
  });
});
