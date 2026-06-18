import {applyArrangementOperations} from '../src/arrangement/operations';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore} from '../src/store/useDAWStore';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {buildApcVirtualTree} from '../src/assistant/apcSourceTree';
import {applyApcPatch, type ApcPatchTransaction} from '../src/assistant/copilotPatchApply';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    tracks: [],
    patterns: {},
    blocks: [],
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    playheadBeat: 0,
    playheadSeconds: 0,
    syncSource: 'ui',
    snapGrid: DEFAULT_SNAP_GRID,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

function setupProject(): {trackId: string} {
  resetStore();
  window.audioEngine = undefined;
  applyArrangementOperations(
    [
      {op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'},
      {op: 'setBpm', bpm: 120},
    ],
    {skipNativeRefresh: true},
  );
  const trackId = useDAWStore.getState().tracks[0]!.id;
  useDAWStore.setState({
    blocks: [
      {
        id: 'clip-audio',
        trackId,
        name: 'Vox',
        startBeat: 0,
        lengthBeats: 4,
        type: 'audio',
        color: '#64a5ff',
        audioFilePath: 'imports/vox.wav',
        absoluteAudioFilePath: '/Users/secret/vox.wav',
        waveformPeaks: [0.1, 0.2, 0.3],
      },
    ],
  });
  return {trackId};
}

function hashOf(path: string): string {
  const tree = buildApcVirtualTree(captureProjectSnapshot());
  return tree.index.find(entry => entry.path === path)!.contentHash;
}

describe('applyApcPatch', () => {
  it('applies a BPM mergeFields edit to project.json', () => {
    setupProject();
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: 'Set BPM to 140',
      changes: [
        {op: 'mergeFields', path: 'project.json', beforeHash: hashOf('project.json'), fields: {bpm: 140}},
      ],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.bpm).toBe(140);
    }
  });

  it('applies a per-track volume mergeFields edit', () => {
    setupProject();
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const trackPath = tree.index.find(e => e.path.startsWith('tracks/'))!.path;
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: 'Turn the track down',
      changes: [
        {op: 'mergeFields', path: trackPath, beforeHash: hashOf(trackPath), fields: {volumeDb: -6}},
      ],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.tracks[0]?.volumeDb).toBe(-6);
    }
  });

  it('replaceFile on a clip preserves stripped fields (waveformPeaks)', () => {
    setupProject();
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const clipPath = 'clips/clip-audio.json';
    // The model edits the SANITIZED content (no waveformPeaks), renaming the clip.
    const sanitized = JSON.parse(tree.files[clipPath]) as Record<string, unknown>;
    expect(sanitized.waveformPeaks).toBeUndefined();
    sanitized.name = 'Lead Vocal';
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: 'Rename clip',
      changes: [
        {op: 'replaceFile', path: clipPath, beforeHash: hashOf(clipPath), content: JSON.stringify(sanitized)},
      ],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const clip = result.snapshot.blocks.find(block => block.id === 'clip-audio');
      expect(clip?.name).toBe('Lead Vocal');
      // Stripped field survived because it was re-attached from the full source.
      expect(clip?.waveformPeaks).toEqual([0.1, 0.2, 0.3]);
      expect(clip?.absoluteAudioFilePath).toBe('/Users/secret/vox.wav');
    }
  });

  it('reports a conflict on a stale baseFingerprint and applies nothing', () => {
    setupProject();
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: 'stale-fingerprint',
      summary: 'x',
      changes: [{op: 'mergeFields', path: 'project.json', beforeHash: 'whatever', fields: {bpm: 200}}],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.length).toBeGreaterThan(0);
    }
  });

  it('reports a conflict on a stale beforeHash', () => {
    setupProject();
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: 'x',
      changes: [{op: 'mergeFields', path: 'project.json', beforeHash: 'wrong-hash', fields: {bpm: 200}}],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.some(c => c.reason.includes('stale'))).toBe(true);
    }
  });

  it('rejects a patch that edits a locked track (lock enforcement on the snapshot path)', () => {
    const {trackId} = setupProject();
    useDAWStore.setState(state => ({
      tracks: state.tracks.map(track => (track.id === trackId ? {...track, isLocked: true} : track)),
    }));
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const trackPath = tree.index.find(e => e.path.startsWith('tracks/'))!.path;
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: 'turn the locked track down',
      changes: [{op: 'mergeFields', path: trackPath, beforeHash: hashOf(trackPath), fields: {volumeDb: -6}}],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.some(c => /lock|frozen/i.test(c.reason))).toBe(true);
    }
  });

  it('rejects editing a clip on a frozen track', () => {
    const {trackId} = setupProject();
    useDAWStore.setState(state => ({
      tracks: state.tracks.map(track => (track.id === trackId ? {...track, isFrozen: true} : track)),
    }));
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const clipPath = 'clips/clip-audio.json';
    const sanitized = JSON.parse(tree.files[clipPath]) as Record<string, unknown>;
    sanitized.name = 'Renamed';
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: 'rename a clip on a frozen track',
      changes: [{op: 'replaceFile', path: clipPath, beforeHash: hashOf(clipPath), content: JSON.stringify(sanitized)}],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.some(c => /lock|frozen/i.test(c.reason))).toBe(true);
    }
  });

  it('rejects editing a locked clip', () => {
    setupProject();
    useDAWStore.setState(state => ({
      blocks: state.blocks.map(block => (block.id === 'clip-audio' ? {...block, isLocked: true} : block)),
    }));
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const clipPath = 'clips/clip-audio.json';
    const sanitized = JSON.parse(tree.files[clipPath]) as Record<string, unknown>;
    sanitized.name = 'Renamed';
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: 'rename a locked clip',
      changes: [{op: 'replaceFile', path: clipPath, beforeHash: hashOf(clipPath), content: JSON.stringify(sanitized)}],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.some(c => /lock/i.test(c.reason))).toBe(true);
    }
  });

  it('rejects a createFile that would overwrite an existing file', () => {
    setupProject();
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: 'clobber an existing clip',
      changes: [{op: 'createFile', path: 'clips/clip-audio.json', content: JSON.stringify({id: 'clip-audio'})}],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.some(c => /already exists/i.test(c.reason))).toBe(true);
    }
  });

  it('rejects moving a clip onto a locked track via mergeFields trackId', () => {
    setupProject(); // track A (unlocked) + clip-audio on it
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'}],
      {skipNativeRefresh: true},
    );
    const lockedId = useDAWStore.getState().tracks[1]!.id;
    useDAWStore.setState(state => ({
      tracks: state.tracks.map(track => (track.id === lockedId ? {...track, isLocked: true} : track)),
    }));
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const clipPath = 'clips/clip-audio.json';
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: 'reassign clip onto the locked track',
      changes: [{op: 'mergeFields', path: clipPath, beforeHash: hashOf(clipPath), fields: {trackId: lockedId}}],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.some(c => /lock|frozen/i.test(c.reason))).toBe(true);
    }
  });

  it('rejects an id-rewrite patch that would redirect a write onto a (locked) sibling entity', () => {
    const {trackId} = setupProject(); // unlocked track A at tracks/<trackId>.json
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'}],
      {skipNativeRefresh: true},
    );
    const lockedId = useDAWStore.getState().tracks[1]!.id;
    useDAWStore.setState(state => ({
      tracks: state.tracks.map(track => (track.id === lockedId ? {...track, isLocked: true} : track)),
    }));
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    // Write to the UNLOCKED track's path but set the content id to the LOCKED track —
    // the parser/compiler would otherwise redirect this onto the locked track.
    const unlockedPath = `tracks/${trackId}.json`;
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: 'id-rewrite bypass attempt',
      changes: [{op: 'mergeFields', path: unlockedPath, beforeHash: hashOf(unlockedPath), fields: {id: lockedId, isLocked: false}}],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const reasons = result.conflicts.map(c => c.reason).join(' ');
      expect(/does not match its id/i.test(reasons)).toBe(true);
    }
    // The locked track is untouched in the store.
    expect(useDAWStore.getState().tracks.find(t => t.id === lockedId)?.isLocked).toBe(true);
  });

  it('rejects an id-collision rewrite that would silently drop a sibling entity', () => {
    const {trackId} = setupProject();
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'}],
      {skipNativeRefresh: true},
    );
    const otherId = useDAWStore.getState().tracks[1]!.id; // both unlocked
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const path = `tracks/${trackId}.json`;
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: 'collide ids',
      changes: [{op: 'mergeFields', path, beforeHash: hashOf(path), fields: {id: otherId}}],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(false); // rejected, rather than silently dropping a track
  });

  it('rejects createFile of a clip onto a locked track', () => {
    const {trackId} = setupProject();
    useDAWStore.setState(state => ({
      tracks: state.tracks.map(track => (track.id === trackId ? {...track, isLocked: true} : track)),
    }));
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const patch: ApcPatchTransaction = {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: 'add a clip to a locked track',
      changes: [{
        op: 'createFile',
        path: 'clips/new-clip.json',
        content: JSON.stringify({id: 'new-clip', trackId, name: 'New', startBeat: 0, lengthBeats: 4, type: 'midi', notes: []}),
      }],
    };
    const result = applyApcPatch(patch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.some(c => /lock|frozen/i.test(c.reason))).toBe(true);
    }
  });
});
