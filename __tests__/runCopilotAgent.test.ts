import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {applyArrangementOperations} from '../src/arrangement/operations';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore} from '../src/store/useDAWStore';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {buildApcVirtualTree} from '../src/assistant/apcSourceTree';
import {runCopilotAgent} from '../src/assistant/runCopilotAgent';
import type {CopilotContextPayload} from '../src/assistant/copilotContext';
import type {CopilotAgentAskResponse} from '../src/native/copilotApi';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

// Minimal context — runCopilotAgent only reads visibleTargets/workflows to sanitize.
const CONTEXT = {visibleTargets: [], workflows: []} as unknown as CopilotContextPayload;

function resetWithTrack(): string {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false, bpm: 120, tracks: [], patterns: {}, blocks: [],
    selectedBlockId: null, selectedBlockIds: [], selectedTrackId: null,
    playheadBeat: 0, playheadSeconds: 0, syncSource: 'ui', snapGrid: DEFAULT_SNAP_GRID,
    masterVolumeDb: 0, masterPan: 0,
    timeSignature: {...DEFAULT_TIME_SIGNATURE}, scale: null, chord: null, sections: [],
    liveMidiPreviewByTrack: {}, liveAudioPreviewByClip: {},
  });
  (window as {audioEngine?: unknown}).audioEngine = undefined;
  applyArrangementOperations(
    [{op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'}],
    {skipNativeRefresh: true},
  );
  return useDAWStore.getState().tracks[0]!.id;
}

function mockAgent(response: CopilotAgentAskResponse): void {
  (window as {copilot?: unknown}).copilot = {agentAsk: jest.fn().mockResolvedValue(response)};
}

const UPSERT = (trackId: string) => ({
  op: 'upsertMidiBlock' as const,
  id: 'clip-ai',
  trackId,
  name: 'AI Lead',
  startBeat: 0,
  lengthBeats: 4,
  notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
});

afterEach(() => {
  delete (window as {copilot?: unknown}).copilot;
});

describe('runCopilotAgent — unified result + staging multiplexing', () => {
  it('passes plain text through with no proposal', async () => {
    resetWithTrack();
    mockAgent({ok: true, text: 'Try adding a track first.', patch: null, model: 'm', turns: 1});
    const result = await runCopilotAgent({message: 'how do I start?', context: CONTEXT});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('adding a track');
      expect(result.proposal).toBeNull();
      expect(result.proposalError).toBeUndefined();
      expect(result.midiOptions).toHaveLength(0);
    }
  });

  it('converts structured midiBlockEdits into ONE operations-kind proposal', async () => {
    const trackId = resetWithTrack();
    // The real agent answer payload carries the structured arrays but NOT the text
    // (text rides the top-level `text`). Mirror that here so the text-merge is exercised.
    mockAgent({
      ok: true, text: 'Prepared a block.', patch: null, model: 'm', turns: 1,
      answer: {midiBlockEdits: [UPSERT(trackId)]},
    });
    const result = await runCopilotAgent({message: 'add a lead', context: CONTEXT});
    expect(result.ok).toBe(true);
    if (result.ok && result.proposal) {
      // The model's text must survive the main→renderer handoff (not the empty-text placeholder).
      expect(result.text).toBe('Prepared a block.');
      expect(result.proposal.edits).toHaveLength(1);
      expect(result.proposal.edits[0]!.kind).toBe('operations');
      // Building the proposal must NOT mutate the live store (preview is applied on Stage).
      expect(useDAWStore.getState().blocks).toHaveLength(0);
    } else {
      throw new Error('expected an operations proposal');
    }
  });

  it('lets creative options coexist with a staged edit', async () => {
    const trackId = resetWithTrack();
    mockAgent({
      ok: true, text: 'Here is a block and two ideas.', patch: null, model: 'm', turns: 1,
      answer: {
        midiBlockEdits: [UPSERT(trackId)],
        midiOptions: [{
          id: 'b1', label: 'Root', role: 'bassline', description: 'd',
          startBeat: 0, lengthBeats: 4, target: {instrumentId: 'bass_growly', presetId: 'growly_bass_lite'},
          notes: [{note: 40, velocity: 100, startBeat: 0, lengthBeats: 1}],
        }],
      },
    });
    const result = await runCopilotAgent({message: 'add a lead and give ideas', context: CONTEXT});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe('Here is a block and two ideas.');
      expect(result.midiOptions).toHaveLength(1);
      expect(result.proposal).not.toBeNull();
    }
  });

  it('prefers the patch and drops co-emitted structured edits (patch wins)', async () => {
    const trackId = resetWithTrack();
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const projectHash = tree.index.find(entry => entry.path === 'project.json')!.contentHash;
    mockAgent({
      ok: true, text: 'Set BPM and prepared a block.', model: 'm', turns: 1,
      patch: {
        schemaVersion: 1,
        baseFingerprint: tree.fingerprint,
        summary: 'Set BPM to 140',
        changes: [{op: 'mergeFields', path: 'project.json', beforeHash: projectHash, fields: {bpm: 140}}],
      },
      answer: {text: 'Set BPM and prepared a block.', midiBlockEdits: [UPSERT(trackId)]},
    });
    const result = await runCopilotAgent({message: 'set bpm 140 and add a lead', context: CONTEXT});
    expect(result.ok).toBe(true);
    if (result.ok && result.proposal) {
      // Patch wins → snapshot-kind edit, NOT the structured operations edit.
      expect(result.proposal.edits[0]!.kind).toBe('snapshot');
    } else {
      throw new Error('expected a patch-derived snapshot proposal');
    }
  });

  it('surfaces a proposalError (no stage) when a structured edit targets a locked track', async () => {
    const trackId = resetWithTrack();
    useDAWStore.setState(state => ({
      tracks: state.tracks.map(track => (track.id === trackId ? {...track, isLocked: true} : track)),
    }));
    mockAgent({
      ok: true, text: 'Tried to edit.', patch: null, model: 'm', turns: 1,
      answer: {text: 'Tried to edit.', midiBlockEdits: [UPSERT(trackId)]},
    });
    const result = await runCopilotAgent({message: 'add a lead', context: CONTEXT});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal).toBeNull();
      expect(result.proposalError).toMatch(/lock/i);
    }
  });

  it('reports unavailable when the bridge has no agent', async () => {
    resetWithTrack();
    (window as {copilot?: unknown}).copilot = {};
    const result = await runCopilotAgent({message: 'hi', context: CONTEXT});
    expect(result.ok).toBe(false);
  });
});
