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

function stemTree(): ApcAgentTree {
  return tree({
    'manifest.json': {format: 'apc', version: 1, trackIds: ['track-drums', 'track-other'], clipIds: ['clip-drums', 'clip-other'], patternIds: []},
    'project.json': {bpm: 120},
    'timeline.json': {timeSignature: {numerator: 4, denominator: 4}, sections: []},
    'tracks/track-drums.json': {id: 'track-drums', name: 'Drums', type: 'voice_audio'},
    'tracks/track-other.json': {id: 'track-other', name: 'Other', type: 'voice_audio'},
    'clips/clip-drums.json': {
      id: 'clip-drums',
      name: 'Midnight_Hoodie_drums',
      type: 'audio',
      trackId: 'track-drums',
      startBeat: 0,
      lengthBeats: 220,
      audioFilePath: 'imports/Midnight_Hoodie_drums.wav',
    },
    'clips/clip-other.json': {
      id: 'clip-other',
      name: 'Midnight_Hoodie_other',
      type: 'audio',
      trackId: 'track-other',
      startBeat: 0,
      lengthBeats: 220,
      audioFilePath: 'imports/Midnight_Hoodie_other.wav',
    },
  });
}

describe('track replacement Build shortcut', () => {
  it('creates the named replacement track before deleting the original source track', () => {
    const prompt = 'Replace the full-length other stem with a new track called Hook texture. Use only the existing audio from the other track. Keep it only in Chorus 1 bars 20-25 and Chorus 2 bars 36-45, then remove the original other track and its clips. Do not generate audio, MIDI, or change any other tracks.';
    const source = stemTree();
    const result = buildBlockStructureShortcut(prompt, source);

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(source, result!.patch)).toEqual([]);
    expect(result?.patch.summary).toBe('Replace other with Hook texture');
    expect(result?.patch.changes).toContainEqual({
      op: 'deleteFile',
      path: 'clips/clip-other.json',
      beforeHash: 'h-clips/clip-other.json',
    });
    expect(result?.patch.changes).toContainEqual({
      op: 'deleteFile',
      path: 'tracks/track-other.json',
      beforeHash: 'h-tracks/track-other.json',
    });
    expect(result?.patch.changes).not.toContainEqual(expect.objectContaining({
      path: 'tracks/track-drums.json',
    }));

    const createdTrack = result?.patch.changes.find(change =>
      change.op === 'createFile' && change.path === 'tracks/ai-replace-hook-texture.json',
    );
    expect(createdTrack).toBeDefined();
    expect(createdTrack?.op === 'createFile' ? JSON.parse(createdTrack.content) : null).toMatchObject({
      id: 'ai-replace-hook-texture',
      name: 'Hook texture',
      isMuted: false,
    });

    const createdClips = result?.patch.changes
      .filter(change => change.op === 'createFile')
      .filter(change => change.path.startsWith('clips/'))
      .map(change => JSON.parse(change.content) as {
        name: string;
        trackId: string;
        startBeat: number;
        lengthBeats: number;
        sourceOffsetBeats: number;
      });
    expect(createdClips).toEqual([
      expect.objectContaining({
        name: 'Chorus 1 - Midnight_Hoodie_other',
        trackId: 'ai-replace-hook-texture',
        startBeat: 76,
        lengthBeats: 24,
        sourceOffsetBeats: 76,
      }),
      expect.objectContaining({
        name: 'Chorus 2 - Midnight_Hoodie_other',
        trackId: 'ai-replace-hook-texture',
        startBeat: 140,
        lengthBeats: 40,
        sourceOffsetBeats: 140,
      }),
    ]);
  });
});
