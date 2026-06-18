import {applyArrangementOperations} from '../src/arrangement/operations';
import {captureProjectSnapshot, snapshotFingerprint} from '../src/arrangement/projectSnapshot';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore} from '../src/store/useDAWStore';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {buildApcVirtualTree} from '../src/assistant/apcSourceTree';
import {
  resetCopilotChatHistoryForTests,
  useCopilotChatHistoryStore,
} from '../src/assistant/copilotChatHistory';
import {
  executeReadOnlyTool,
  grepProjectFiles,
  listProjectFiles,
  readProjectFile,
} from '../electron/copilotAgentTools';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function resetStore(): void {
  resetArrangementHistoryForTests();
  resetCopilotChatHistoryForTests();
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

function buildTree() {
  resetStore();
  window.audioEngine = undefined;
  applyArrangementOperations(
    [
      {op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'},
      {op: 'setBpm', bpm: 128},
    ],
    {skipNativeRefresh: true},
  );
  // An audio clip carrying fields that MUST be stripped from the agent's view.
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
        absoluteAudioFilePath: '/Users/secret/local/vox.wav',
        waveformPeaks: [0.1, 0.2, 0.3, 0.4],
      },
    ],
  });
  return buildApcVirtualTree(captureProjectSnapshot());
}

describe('apc virtual tree + agent read tools', () => {
  it('fingerprint equals the snapshot fingerprint', () => {
    resetStore();
    window.audioEngine = undefined;
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    expect(tree.fingerprint).toBe(snapshotFingerprint(captureProjectSnapshot()));
  });

  it('lists files and filters by glob', () => {
    const tree = buildTree();
    const all = listProjectFiles(tree, {});
    expect(all.files.some(f => f.path === 'project.json')).toBe(true);
    expect(all.files.some(f => f.path === 'manifest.json')).toBe(true);

    const tracksOnly = listProjectFiles(tree, {glob: 'tracks/*.json'});
    expect(tracksOnly.files.length).toBeGreaterThan(0);
    expect(tracksOnly.files.every(f => f.path.startsWith('tracks/'))).toBe(true);
  });

  it('reads a file and returns a contentHash matching the index', () => {
    const tree = buildTree();
    const read = readProjectFile(tree, {path: 'project.json'});
    expect('content' in read).toBe(true);
    if ('content' in read) {
      expect(read.content).toContain('"bpm":128');
      const indexed = tree.index.find(e => e.path === 'project.json');
      expect(read.contentHash).toBe(indexed?.contentHash);
    }
  });

  it('strips waveforms and absolute local paths from clip files', () => {
    const tree = buildTree();
    const read = readProjectFile(tree, {path: 'clips/clip-audio.json'});
    expect('content' in read).toBe(true);
    if ('content' in read) {
      expect(read.content).not.toContain('waveformPeaks');
      expect(read.content).not.toContain('absoluteAudioFilePath');
      expect(read.content).not.toContain('/Users/secret/local/vox.wav');
      // Project-relative reference is retained (not a local-disk path).
      expect(read.content).toContain('imports/vox.wav');
    }
  });

  it('omits saved Copilot chat history from the agent-visible source tree', () => {
    resetStore();
    const chat = useCopilotChatHistoryStore.getState();
    chat.appendMessage(chat.activeSessionId, {id: 'chat-1', role: 'user', content: 'Private old chat'});
    const tree = buildApcVirtualTree(captureProjectSnapshot());

    expect(tree.files['copilot.json']).toBeUndefined();
    expect(tree.index.some(entry => entry.path === 'copilot.json')).toBe(false);
  });

  it('returns an error for an unknown path', () => {
    const tree = buildTree();
    const read = readProjectFile(tree, {path: 'tracks/does-not-exist.json'});
    expect('error' in read).toBe(true);
  });

  it('greps across the tree and bounds results', () => {
    const tree = buildTree();
    const hits = grepProjectFiles(tree, {pattern: 'bpm'});
    expect(hits.matches.some(m => m.path === 'project.json')).toBe(true);

    const capped = grepProjectFiles(tree, {pattern: '"', maxMatches: 2});
    expect(capped.matches.length).toBeLessThanOrEqual(2);
  });

  it('dispatches via executeReadOnlyTool', () => {
    const tree = buildTree();
    const result = executeReadOnlyTool(tree, 'list_project_files', {glob: '*'}) as {files: unknown[]};
    expect(Array.isArray(result.files)).toBe(true);
    const unknown = executeReadOnlyTool(tree, 'nope', {}) as {error: string};
    expect(unknown.error).toContain('Unknown tool');
  });
});
