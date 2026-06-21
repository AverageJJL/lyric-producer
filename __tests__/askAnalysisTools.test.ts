import {runAskSessionTool, type AskToolResult} from '../electron/askAnalysisTools';
import type {ApcAgentTree} from '../electron/copilotAgentTools';

/** Hand-build a sanitized agent tree from a path->object map (mirrors the .apc layout). */
function buildTree(files: Record<string, unknown>): ApcAgentTree {
  const stringFiles: Record<string, string> = {};
  const index: ApcAgentTree['index'] = [];
  for (const [path, value] of Object.entries(files)) {
    const content = typeof value === 'string' ? value : JSON.stringify(value);
    stringFiles[path] = content;
    index.push({path, bytes: content.length, contentHash: `h-${path}`});
  }
  return {fingerprint: 'fp', files: stringFiles, index};
}

function sampleTree(): ApcAgentTree {
  return buildTree({
    'manifest.json': {format: 'apc', version: 1, trackIds: ['t1', 't2'], clipIds: ['c1', 'c2'], patternIds: ['p1']},
    'project.json': {bpm: 120, scale: {root: 'A', mode: 'minor'}},
    'timeline.json': {timeSignature: {numerator: 4, denominator: 4}, sections: [{name: 'Intro', startBeat: 0, lengthBeats: 16}]},
    'tracks/t1.json': {id: 't1', name: 'Drums', type: 'drum_machine'},
    'tracks/t2.json': {id: 't2', name: 'Bass', type: 'software_instrument'},
    'tracks/t3.json': {id: 't3', name: 'Vocal', type: 'voice_audio'},
    'clips/c1.json': {id: 'c1', trackId: 't1', name: 'Main Beat', type: 'audio', startBeat: 0, lengthBeats: 16, patternId: 'p1'},
    'clips/c2.json': {
      id: 'c2',
      trackId: 't2',
      name: 'Bassline',
      type: 'midi',
      startBeat: 0,
      lengthBeats: 8,
      notes: [
        {note: 40, velocity: 90, startBeat: 0, lengthBeats: 1},
        {note: 47, velocity: 90, startBeat: 2, lengthBeats: 1},
        {note: 52, velocity: 90, startBeat: 4, lengthBeats: 1},
        {note: 55, velocity: 90, startBeat: 6, lengthBeats: 1},
      ],
    },
    'clips/c3.json': {
      id: 'c3',
      trackId: 't3',
      name: 'Lead Vocal',
      type: 'audio',
      startBeat: 4,
      lengthBeats: 8,
      audioFilePath: 'imports/vocal.mp3',
      durationSeconds: 16,
    },
    'patterns/p1.json': {id: 'p1', steps: {kick: [true, false, false, false], snare: [false, false, true, false]}},
  });
}

function expectResult(value: AskToolResult | null): AskToolResult {
  expect(value).not.toBeNull();
  return value as AskToolResult;
}

describe('runAskSessionTool', () => {
  it('summarizes the session with counts, tempo, and key', () => {
    const {result, report} = expectResult(runAskSessionTool(sampleTree(), 'get_session_summary', {}));
    expect(result).toMatchObject({trackCount: 3, clipCount: 3, patternCount: 1, bpm: 120});
    expect((result as {key: string}).key).toBe('A minor');
    expect((result as {projectLengthBeats: number}).projectLengthBeats).toBe(16);
    expect(report?.kind).toBe('summary');
    expect(report?.metrics.find(metric => metric.label === 'Tracks')?.value).toBe('3');
  });

  it('finds clips by name substring', () => {
    const {result, report} = expectResult(runAskSessionTool(sampleTree(), 'find_clips', {query: 'bass'}));
    expect((result as {matchCount: number}).matchCount).toBe(1);
    expect((result as {clips: Array<{name: string; trackName?: string}>}).clips[0]).toMatchObject({
      name: 'Bassline',
      trackName: 'Bass',
    });
    expect(report?.kind).toBe('clips');
  });

  it('filters clips by type', () => {
    const {result} = expectResult(runAskSessionTool(sampleTree(), 'find_clips', {type: 'audio'}));
    const clips = (result as {clips: Array<{name: string}>}).clips;
    expect(clips).toHaveLength(2);
    expect(clips.map(clip => clip.name)).toEqual(['Main Beat', 'Lead Vocal']);
  });

  it('filters clips by time window (overlap)', () => {
    const {result} = expectResult(runAskSessionTool(sampleTree(), 'find_clips', {minBeat: 10, maxBeat: 16}));
    // The 16-beat drum clip and beat 4-12 vocal overlap this window; the bassline ends at 8.
    const clips = (result as {clips: Array<{id: string}>}).clips;
    expect(clips.map(clip => clip.id)).toEqual(['c1', 'c3']);
  });

  it('computes per-track arrangement density', () => {
    const {result, report} = expectResult(runAskSessionTool(sampleTree(), 'analyze_arrangement_density', {}));
    const tracks = (result as {tracks: Array<{track: string; fillFraction: number; events: number}>}).tracks;
    expect(tracks).toHaveLength(3);
    const drums = tracks.find(track => track.track === 'Drums');
    expect(drums?.fillFraction).toBeCloseTo(1, 2); // 16-beat clip fills the 16-beat project
    expect(report?.kind).toBe('density');
    expect(report?.bars?.length).toBe(3);
  });

  it('inspects timeline blocks as audio, MIDI, and drum-pattern inventory', () => {
    const {result, report} = expectResult(runAskSessionTool(sampleTree(), 'inspect_timeline_blocks', {}));
    const inventory = result as {
      counts: {audio: number; midi: number; drum: number; measurableAudio: number};
      blocks: Array<{id: string; kind: string; measurementReady?: boolean; pitchRange?: string; activeSteps?: number}>;
      demoPrompts: string[];
    };
    expect(inventory.counts).toMatchObject({audio: 1, midi: 1, drum: 1, measurableAudio: 1});
    expect(inventory.blocks.find(block => block.id === 'c1')).toMatchObject({kind: 'drum', activeSteps: 2});
    expect(inventory.blocks.find(block => block.id === 'c2')).toMatchObject({kind: 'midi', pitchRange: 'E2-G3'});
    expect(inventory.blocks.find(block => block.id === 'c3')).toMatchObject({kind: 'audio', measurementReady: true});
    expect(inventory.demoPrompts.some(prompt => prompt.includes('Build: duplicate'))).toBe(true);
    expect(report?.kind).toBe('blocks');
  });

  it('returns null for an unknown tool name', () => {
    expect(runAskSessionTool(sampleTree(), 'measure_loudness', {})).toBeNull();
  });
});
