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
    'manifest.json': {format: 'apc', version: 1, trackIds: ['track-vocal', 'track-piano'], clipIds: ['clip-vocal', 'clip-piano'], patternIds: []},
    'project.json': {bpm: 120},
    'timeline.json': {timeSignature: {numerator: 4, denominator: 4}, sections: []},
    'tracks/track-vocal.json': {id: 'track-vocal', name: 'Voice 6', type: 'voice_audio'},
    'tracks/track-piano.json': {id: 'track-piano', name: 'Voice 5', type: 'voice_audio'},
    'clips/clip-vocal.json': {
      id: 'clip-vocal',
      name: 'Midnight_Hoodie_vocals',
      type: 'audio',
      trackId: 'track-vocal',
      startBeat: 0,
      lengthBeats: 128,
      audioFilePath: 'imports/vocals.wav',
    },
    'clips/clip-piano.json': {
      id: 'clip-piano',
      name: 'Midnight_Hoodie_piano',
      type: 'audio',
      trackId: 'track-piano',
      startBeat: 0,
      lengthBeats: 128,
      audioFilePath: 'imports/piano.wav',
    },
  });
}

function builtStemTree(): ApcAgentTree {
  const stems = ['bass', 'drums', 'guitar', 'other', 'piano', 'vocals'];
  const files: Record<string, unknown> = {
    'manifest.json': {
      format: 'apc',
      version: 1,
      trackIds: stems.map(stem => `build-${stem}`),
      clipIds: stems.flatMap(stem => [1, 2, 3, 4, 5].map(index => `clip-${stem}-${index}`)),
      patternIds: [],
    },
    'project.json': {bpm: 120},
    'timeline.json': {timeSignature: {numerator: 4, denominator: 4}, sections: []},
  };
  stems.forEach((stem, stemIndex) => {
    files[`tracks/build-${stem}.json`] = {
      id: `build-${stem}`,
      name: `Build slices - Voice ${stemIndex + 1}`,
      type: 'voice_audio',
    };
    [1, 2, 3, 4, 5].forEach(index => {
      files[`clips/clip-${stem}-${index}.json`] = {
        id: `clip-${stem}-${index}`,
        name: `${index === 3 ? 'Groove vocal space' : 'Groove'} - Midnight_Hoodie_${stem}`,
        type: 'audio',
        trackId: `build-${stem}`,
        startBeat: index * 8,
        lengthBeats: 8,
        audioFilePath: `imports/${stem}.wav`,
      };
    });
  });
  return tree(files);
}

describe('build delete shortcut', () => {
  it('deletes vocals without deleting piano when the prompt excludes piano', () => {
    const result = buildBlockStructureShortcut('delete the vocals, not the piano', stemTree());

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(stemTree(), result!.patch)).toEqual([]);
    expect(result?.patch.changes).toEqual([
      {op: 'deleteFile', path: 'clips/clip-vocal.json', beforeHash: 'h-clips/clip-vocal.json'},
      {op: 'deleteFile', path: 'tracks/track-vocal.json', beforeHash: 'h-tracks/track-vocal.json'},
    ]);
  });

  it('does not match every generated vocal-space section as the vocal stem', () => {
    const result = buildBlockStructureShortcut('remove the vocals', builtStemTree());

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(builtStemTree(), result!.patch)).toEqual([]);
    expect(result?.patch.changes).toHaveLength(6);
    expect(result?.patch.changes).toContainEqual({
      op: 'deleteFile',
      path: 'tracks/build-vocals.json',
      beforeHash: 'h-tracks/build-vocals.json',
    });
    expect(result?.patch.changes).not.toContainEqual(expect.objectContaining({
      path: 'tracks/build-bass.json',
    }));
  });

  it('removes the whole recently referenced track from contextual follow-up wording', () => {
    const result = buildBlockStructureShortcut('remove all the clips on that track', builtStemTree(), [
      {role: 'user', content: 'remove the track with "midnight_hoodie_vocals"'},
      {role: 'assistant', content: 'I can remove that vocal track.'},
    ]);

    expect(result).not.toBeNull();
    expect(validatePatchAgainstTree(builtStemTree(), result!.patch)).toEqual([]);
    expect(result?.patch.changes).toHaveLength(6);
    expect(result?.patch.changes.at(-1)).toEqual({
      op: 'deleteFile',
      path: 'tracks/build-vocals.json',
      beforeHash: 'h-tracks/build-vocals.json',
    });
  });
});
