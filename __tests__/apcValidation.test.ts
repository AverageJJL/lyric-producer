import {applyArrangementOperations} from '../src/arrangement/operations';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {
  apcRelativePathIsSafe,
  compileApcSourceToSnapshot,
  decomposeSnapshotToApcSource,
  isFatalApcIssue,
  validateApcSource,
  type ApcSourceProject,
  type ApcValidationCode,
} from '../src/arrangement/apc';

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
    masterVolumeDb: 0,
    masterPan: 0,
    snapGrid: DEFAULT_SNAP_GRID,
    isRelativeSnapEnabled: false,
    performanceMode: 'linear',
    looperLengthBars: 4,
    isCycleEnabled: false,
    cycleStartBeat: 0,
    cycleEndBeat: 4,
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    playheadBeat: 0,
    playheadSeconds: 0,
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

const clone = (source: ApcSourceProject): ApcSourceProject =>
  JSON.parse(JSON.stringify(source)) as ApcSourceProject;

const codes = (source: ApcSourceProject): ApcValidationCode[] =>
  validateApcSource(source).map(issue => issue.code);

function buildBaseSource(): ApcSourceProject {
  resetStore();
  window.audioEngine = undefined;
  applyArrangementOperations(
    [{op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'}],
    {skipNativeRefresh: true},
  );
  const trackId = useDAWStore.getState().tracks[0]!.id;
  applyArrangementOperations(
    [
      {
        op: 'upsertMidiClip',
        clip: {
          id: 'clip-1',
          trackId,
          name: 'Lead',
          startBeat: 0,
          lengthBeats: 4,
          notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
        },
      },
    ],
    {skipNativeRefresh: true},
  );
  return decomposeSnapshotToApcSource(captureProjectSnapshot(), '2026-01-01T00:00:00.000Z');
}

describe('validateApcSource', () => {
  let base: ApcSourceProject;
  beforeEach(() => {
    base = buildBaseSource();
  });

  it('accepts a well-formed source with no issues', () => {
    expect(validateApcSource(base)).toEqual([]);
    expect(compileApcSourceToSnapshot(base).ok).toBe(true);
  });

  it('rejects duplicate ids (fatal)', () => {
    const corrupt = clone(base);
    corrupt.manifest.clipIds.push('clip-1');
    expect(codes(corrupt)).toContain('duplicate-id');
    const result = compileApcSourceToSnapshot(corrupt);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.every(isFatalApcIssue)).toBe(true);
    }
  });

  it('rejects clips referencing missing tracks (fatal)', () => {
    const corrupt = clone(base);
    corrupt.clips['clip-1'].trackId = 'track-missing';
    expect(codes(corrupt)).toContain('dangling-clip-track');
    expect(compileApcSourceToSnapshot(corrupt).ok).toBe(false);
  });

  it('rejects a manifest entry without a backing file (fatal)', () => {
    const corrupt = clone(base);
    corrupt.manifest.trackIds.push('track-ghost');
    expect(codes(corrupt)).toContain('manifest-mismatch');
    expect(compileApcSourceToSnapshot(corrupt).ok).toBe(false);
  });

  it('flags a dangling pattern reference (non-fatal warning)', () => {
    const corrupt = clone(base);
    corrupt.clips['clip-1'].patternId = 'pattern-missing';
    expect(codes(corrupt)).toContain('dangling-pattern');
    const result = compileApcSourceToSnapshot(corrupt);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.map(w => w.code)).toContain('dangling-pattern');
    }
  });

  it('flags notes outside MIDI range and notes that START past the clip (non-fatal)', () => {
    const outOfRange = clone(base);
    outOfRange.clips['clip-1'].notes = [{note: 200, velocity: 100, startBeat: 0, lengthBeats: 1}];
    expect(codes(outOfRange)).toContain('note-out-of-range');

    const startsPast = clone(base);
    startsPast.clips['clip-1'].notes = [{note: 60, velocity: 100, startBeat: 99, lengthBeats: 4}];
    expect(codes(startsPast)).toContain('note-out-of-clip');

    expect(compileApcSourceToSnapshot(outOfRange).ok).toBe(true);
  });

  it('does NOT flag a note that merely extends past the clip edge (non-destructive resize)', () => {
    // A clip shrunk via resizeBlock keeps its full notes; a note starting inside the
    // clip but ending beyond it is valid and must not warn.
    const extendsPast = clone(base);
    extendsPast.clips['clip-1'].notes = [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 999}];
    expect(codes(extendsPast)).not.toContain('note-out-of-clip');
  });

  it('does not let prototype-chain ids (toString/__proto__) bypass manifest checks', () => {
    const corrupt = clone(base);
    corrupt.manifest.trackIds.push('toString');
    expect(codes(corrupt)).toContain('manifest-mismatch');
    expect(compileApcSourceToSnapshot(corrupt).ok).toBe(false);
  });

  it('flags reserved path-token ids ("..") as unsafe', () => {
    const corrupt = clone(base);
    corrupt.manifest.trackIds.push('..');
    expect(codes(corrupt)).toContain('unsafe-path');
  });

  it('flags unsafe asset paths (non-fatal)', () => {
    const traversal = clone(base);
    traversal.clips['clip-1'].audioFilePath = '../../etc/passwd';
    expect(codes(traversal)).toContain('unsafe-asset-path');
  });
});

describe('apcRelativePathIsSafe', () => {
  it.each([
    ['imports/vocal.wav', true],
    ['recordings/take-1.wav', true],
    ['../escape.wav', false],
    ['a/../b.wav', false],
    ['/absolute/path.wav', false],
    ['C:\\windows\\path.wav', false],
    ['', false],
  ])('treats "%s" as safe=%s', (path, expected) => {
    expect(apcRelativePathIsSafe(path)).toBe(expected);
  });
});
