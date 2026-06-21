import {
  compileApcSourceToSnapshot,
  decomposeSnapshotToApcSource,
  parseApcSourceFiles,
  serializeApcSource,
} from '../src/arrangement/apc';
import {buildDawProjectExport} from '../src/arrangement/dawProjectExport';
import {dawProjectSnapshotFromPackage} from '../src/arrangement/dawProjectImport';
import {captureProjectSnapshot, emptyProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {
  beatToLyricTimeInput,
  defaultLyricDocument,
  estimateSectionLineTimings,
  lyricTimeInputToBeat,
  normalizeLyricSimilarityReport,
  parseLyricTimeInput,
  resolveLyricHighlight,
  type LyricDocument,
} from '../src/store/lyrics';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

const TS = '2026-06-20T12:00:00.000Z';

function lyricDocument(): LyricDocument {
  return {
    schemaVersion: 1,
    sections: [{
      id: 'section-a',
      name: '[Section 1]',
      startBeat: 0,
      endBeat: 16,
      lines: [
        {id: 'line-a', text: 'first bright line', timingSource: 'unset'},
        {id: 'line-b', text: 'second line has extra words', timingSource: 'unset'},
      ],
    }],
    similarityReport: null,
  };
}

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    tempoMap: [],
    meterMap: [],
    isMetronomeEnabled: true,
    recordingCountInBeats: 0,
    recordingPreRollBeats: 0,
    isPunchRecordingEnabled: false,
    isLoopRecordingEnabled: false,
    recordingLatencyCompensationMs: 0,
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
    isRecording: false,
    recordingBlockId: null,
    recordingStartSeconds: null,
    recordingWallClockStart: null,
    recordingError: null,
    playheadBeat: 0,
    playheadSeconds: 0,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    playStartSeconds: 0,
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    lyrics: defaultLyricDocument(),
    midiAudition: null,
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

function snapshotWithLyrics(): ReturnType<typeof emptyProjectSnapshot> {
  const track: DAWTrack = {
    id: 'track-1',
    name: 'Lead',
    isMuted: false,
    isSolo: false,
    type: 'software_instrument',
    instrumentId: 'synth_lead',
    presetId: 'pop_lead',
    isRecordArmed: false,
    isLocked: false,
  };
  const block: DAWBlock = {
    id: 'clip-1',
    trackId: track.id,
    name: 'Lead clip',
    startBeat: 0,
    lengthBeats: 4,
    type: 'midi',
    color: '#64a5ff',
    notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
  };
  return {...emptyProjectSnapshot(), lyrics: lyricDocument(), tracks: [track], blocks: [block]};
}

describe('authored lyrics model', () => {
  beforeEach(resetStore);

  it('parses compact timestamps and converts through the tempo map in beats', () => {
    expect(parseLyricTimeInput('0:23.50')).toBe(23.5);
    expect(parseLyricTimeInput('83.25')).toBe(83.25);
    expect(parseLyricTimeInput('1:60')).toBeNull();
    expect(lyricTimeInputToBeat('0:23.50', 120, [])).toBe(47);
    expect(beatToLyricTimeInput(47, 120, [])).toBe('0:23.50');
  });

  it('estimates line timestamps by lyric weight and resolves playback highlighting', () => {
    const estimated = estimateSectionLineTimings(lyricDocument(), 'section-a');

    expect(estimated.sections[0]?.lines[0]?.startBeat).toBe(0);
    expect(estimated.sections[0]?.lines[1]?.startBeat).toBeCloseTo(6, 5);
    expect(estimated.sections[0]?.lines[1]?.timingSource).toBe('estimated');

    const highlight = resolveLyricHighlight(estimated, 9);
    expect(highlight).toMatchObject({
      sectionId: 'section-a',
      lineId: 'line-b',
    });
    expect(highlight?.activeWordIndex).toBeGreaterThan(0);
  });

  it('sanitizes similarity reports before storing them', () => {
    const report = normalizeLyricSimilarityReport({
      checkedAt: 'now',
      risk: 'very',
      note: 'x'.repeat(400),
      matches: Array.from({length: 8}, (_, index) => ({
        candidateId: index,
        title: 't'.repeat(200),
        score: 2,
        longestOverlap: 'o'.repeat(200),
        matchedLineIds: ['line-a', 4],
      })),
    });

    expect(report?.risk).toBe('unavailable');
    expect(report?.note).toHaveLength(240);
    expect(report?.matches).toHaveLength(5);
    expect(report?.matches[0]).toMatchObject({
      candidateId: 'match-0',
      score: 1,
      matchedLineIds: ['line-a'],
    });
  });

  it('captures authored lyrics in undoable store snapshots', () => {
    const section = useDAWStore.getState().lyrics.sections[0]!;
    const line = section.lines[0]!;

    useDAWStore.getState().updateLyricLineText(section.id, line.id, 'new lyric line');
    expect(captureProjectSnapshot().lyrics.sections[0]?.lines[0]?.text).toBe('new lyric line');

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().lyrics.sections[0]?.lines[0]?.text).toBe('');

    useDAWStore.getState().redo();
    expect(useDAWStore.getState().lyrics.sections[0]?.lines[0]?.text).toBe('new lyric line');
  });

  it('defaults line timestamps from the section start and previous line', () => {
    const section = useDAWStore.getState().lyrics.sections[0]!;
    const firstLine = section.lines[0]!;
    expect(firstLine.startBeat).toBe(section.startBeat);

    useDAWStore.getState().setLyricSectionTiming(section.id, 'startBeat', 4);
    const movedSection = useDAWStore.getState().lyrics.sections[0]!;
    expect(movedSection.lines[0]?.startBeat).toBe(4);

    const nextId = useDAWStore.getState().addLyricLine(movedSection.id, movedSection.lines[0]?.id);
    const nextLine = useDAWStore.getState().lyrics.sections[0]?.lines.find(line => line.id === nextId);
    expect(nextLine?.startBeat).toBe(6);
    expect(nextLine?.timingSource).toBe('estimated');

    const nextSectionId = useDAWStore.getState().addLyricSection(movedSection.id);
    const nextSection = useDAWStore.getState().lyrics.sections.find(section => section.id === nextSectionId);
    expect(nextSection?.startBeat).toBe(10);
    expect(nextSection?.lines[0]?.startBeat).toBe(10);
  });

  it('syncs section and line timings from lyric line lengths', () => {
    const firstSection = useDAWStore.getState().lyrics.sections[0]!;
    const firstLine = firstSection.lines[0]!;
    useDAWStore.getState().updateLyricLineText(firstSection.id, firstLine.id, 'short line');
    const secondId = useDAWStore.getState().addLyricSection(firstSection.id);
    const second = useDAWStore.getState().lyrics.sections.find(section => section.id === secondId)!;
    useDAWStore.getState().updateLyricLineText(second.id, second.lines[0]!.id, 'longer lyric line with more words');

    useDAWStore.getState().syncLyricTimings();

    const sections = useDAWStore.getState().lyrics.sections;
    expect(sections[0]?.startBeat).toBe(0);
    expect(sections[0]?.endBeat).toBe(2);
    expect(sections[1]?.startBeat).toBe(2);
    expect(sections[1]?.endBeat).toBeCloseTo(6.5);
  });

  it('round-trips lyrics through .apc files and defaults older projects to empty lyrics', () => {
    const files = serializeApcSource(decomposeSnapshotToApcSource(snapshotWithLyrics(), TS));
    expect(files.some(file => file.relativePath === 'lyrics.json')).toBe(true);

    const parsed = parseApcSourceFiles(files);
    expect(parsed.ok && parsed.source.lyrics.sections[0]?.lines[0]?.text).toBe('first bright line');
    const compiled = parsed.ok ? compileApcSourceToSnapshot(parsed.source) : null;
    expect(compiled?.ok && compiled.snapshot.lyrics.sections[0]?.name).toBe('[Section 1]');

    const older = parseApcSourceFiles(files.filter(file => file.relativePath !== 'lyrics.json'));
    expect(older.ok && older.source.lyrics).toEqual(defaultLyricDocument());
  });

  it('round-trips lyrics through the DAWproject extension', () => {
    const exported = buildDawProjectExport(snapshotWithLyrics());
    const imported = dawProjectSnapshotFromPackage({
      extensionJson: exported.extensionJson,
      mediaFiles: [],
      projectXml: exported.projectXml,
    }, jest.fn());

    expect(imported.ok && imported.snapshot.lyrics.sections[0]?.lines[1]?.text)
      .toBe('second line has extra words');
  });
});
