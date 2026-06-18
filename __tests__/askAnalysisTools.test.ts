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
    'clips/c1.json': {id: 'c1', trackId: 't1', name: 'Main Beat', type: 'audio', startBeat: 0, lengthBeats: 16, patternId: 'p1'},
    'clips/c2.json': {id: 'c2', trackId: 't2', name: 'Bassline', type: 'midi', startBeat: 0, lengthBeats: 8, notes: [{}, {}, {}, {}]},
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
    expect(result).toMatchObject({trackCount: 2, clipCount: 2, patternCount: 1, bpm: 120});
    expect((result as {key: string}).key).toBe('A minor');
    expect((result as {projectLengthBeats: number}).projectLengthBeats).toBe(16);
    expect(report?.kind).toBe('summary');
    expect(report?.metrics.find(metric => metric.label === 'Tracks')?.value).toBe('2');
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
    expect(clips).toHaveLength(1);
    expect(clips[0].name).toBe('Main Beat');
  });

  it('filters clips by time window (overlap)', () => {
    const {result} = expectResult(runAskSessionTool(sampleTree(), 'find_clips', {minBeat: 10, maxBeat: 16}));
    // Only the 16-beat audio clip reaches past beat 10; the 8-beat bassline ends at 8.
    const clips = (result as {clips: Array<{id: string}>}).clips;
    expect(clips.map(clip => clip.id)).toEqual(['c1']);
  });

  it('computes per-track arrangement density', () => {
    const {result, report} = expectResult(runAskSessionTool(sampleTree(), 'analyze_arrangement_density', {}));
    const tracks = (result as {tracks: Array<{track: string; fillFraction: number; events: number}>}).tracks;
    expect(tracks).toHaveLength(2);
    const drums = tracks.find(track => track.track === 'Drums');
    expect(drums?.fillFraction).toBeCloseTo(1, 2); // 16-beat clip fills the 16-beat project
    expect(report?.kind).toBe('density');
    expect(report?.bars?.length).toBe(2);
  });

  it('returns null for an unknown tool name', () => {
    expect(runAskSessionTool(sampleTree(), 'measure_loudness', {})).toBeNull();
  });
});
