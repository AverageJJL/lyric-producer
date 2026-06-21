import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {applyArrangementOperations} from '../src/arrangement/operations';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore} from '../src/store/useDAWStore';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {buildApcVirtualTree} from '../src/assistant/apcSourceTree';
import {
  askCopilotAgent,
  DEFAULT_AGENT_MODEL,
} from '../electron/copilotAgentLoop';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function tree() {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false, bpm: 120, tracks: [], patterns: {}, blocks: [],
    selectedBlockId: null, selectedBlockIds: [], selectedTrackId: null,
    playheadBeat: 0, playheadSeconds: 0, syncSource: 'ui', snapGrid: DEFAULT_SNAP_GRID,
    timeSignature: {...DEFAULT_TIME_SIGNATURE}, scale: null, chord: null, sections: [],
    liveMidiPreviewByTrack: {}, liveAudioPreviewByClip: {},
  });
  (window as {audioEngine?: unknown}).audioEngine = undefined;
  applyArrangementOperations(
    [{op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'}],
    {skipNativeRefresh: true},
  );
  return buildApcVirtualTree(captureProjectSnapshot());
}

function toolCall(name: string, args: unknown) {
  return {id: `call-${name}`, type: 'function', function: {name, arguments: JSON.stringify(args)}};
}

function chat(message: Record<string, unknown>) {
  return {ok: true, status: 200, json: async () => ({choices: [{message}]})};
}

/** A mock fetch that replays queued responses and records each request body. */
function mockFetch(queue: Array<{ok: boolean; status: number; json: () => Promise<unknown>}>) {
  const bodies: any[] = [];
  const impl = (async (_url: string, init: {body: string}) => {
    bodies.push(JSON.parse(init.body));
    return queue.shift() ?? {ok: false, status: 500, json: async () => ({})};
  }) as unknown as typeof fetch;
  return {impl, bodies};
}

const ENV = {OPENROUTER_API_KEY: 'test-key'} as NodeJS.ProcessEnv;

describe('askCopilotAgent', () => {
  it('runs a read→edit tool loop and returns a validated patch', async () => {
    const t = tree();
    const projectHash = t.index.find(e => e.path === 'project.json')!.contentHash;
    const patchArgs = {
      summary: 'Set BPM to 140',
      baseFingerprint: t.fingerprint,
      changes: [{op: 'mergeFields', path: 'project.json', beforeHash: projectHash, fields: {bpm: 140}}],
    };
    const {impl} = mockFetch([
      chat({content: null, tool_calls: [toolCall('grep_project_files', {pattern: 'bpm'})]}),
      chat({content: null, tool_calls: [toolCall('submit_project_patch', patchArgs)]}),
    ]);

    const result = await askCopilotAgent({message: 'set bpm to 140', tree: t}, {env: ENV, fetchImpl: impl});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch?.changes[0]).toMatchObject({path: 'project.json', op: 'mergeFields'});
      expect(result.model).toBe(DEFAULT_AGENT_MODEL);
      expect(result.turns).toBe(2);
    }
  });

  it('returns a final text answer when the model asks a question', async () => {
    const t = tree();
    const {impl} = mockFetch([chat({content: 'Which track did you mean?'})]);
    const result = await askCopilotAgent({message: 'make it louder', tree: t}, {env: ENV, fetchImpl: impl});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch).toBeNull();
      expect(result.text).toContain('Which track');
    }
  });

  it('falls back to the secondary model on a first-turn HTTP failure', async () => {
    const t = tree();
    const projectHash = t.index.find(e => e.path === 'project.json')!.contentHash;
    const fallbackModel = 'google/gemini-3.1-flash-lite';
    const {impl, bodies} = mockFetch([
      {ok: false, status: 404, json: async () => ({})},
      chat({content: null, tool_calls: [toolCall('submit_project_patch', {
        summary: 'x', baseFingerprint: t.fingerprint,
        changes: [{op: 'mergeFields', path: 'project.json', beforeHash: projectHash, fields: {bpm: 130}}],
      })]}),
    ]);

    const result = await askCopilotAgent(
      {message: 'bpm 130', tree: t},
      {env: {...ENV, AI_PRODUCER_FALLBACK_MODEL: fallbackModel}, fetchImpl: impl},
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model).toBe(fallbackModel);
    }
    expect(bodies[0].model).toBe(DEFAULT_AGENT_MODEL);
    expect(bodies[1].model).toBe(fallbackModel);
  });

  it('rejects a stale-hash patch and lets the model correct itself', async () => {
    const t = tree();
    const projectHash = t.index.find(e => e.path === 'project.json')!.contentHash;
    const {impl} = mockFetch([
      chat({content: null, tool_calls: [toolCall('submit_project_patch', {
        summary: 'bad', baseFingerprint: t.fingerprint,
        changes: [{op: 'mergeFields', path: 'project.json', beforeHash: 'WRONG', fields: {bpm: 150}}],
      })]}),
      chat({content: null, tool_calls: [toolCall('submit_project_patch', {
        summary: 'good', baseFingerprint: t.fingerprint,
        changes: [{op: 'mergeFields', path: 'project.json', beforeHash: projectHash, fields: {bpm: 150}}],
      })]}),
    ]);

    const result = await askCopilotAgent({message: 'bpm 150', tree: t}, {env: ENV, fetchImpl: impl});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.turns).toBe(2);
      expect(result.patch?.summary).toBe('good');
    }
  });

  it('rejects a created entity file whose JSON id does not match its path', async () => {
    const t = tree();
    const {impl} = mockFetch([
      chat({content: null, tool_calls: [toolCall('submit_project_patch', {
        summary: 'bad track',
        baseFingerprint: t.fingerprint,
        changes: [{op: 'createFile', path: 'tracks/track_drums.json', content: JSON.stringify({name: 'Trap Drums'})}],
      })]}),
      chat({content: null, tool_calls: [toolCall('submit_project_patch', {
        summary: 'good track',
        baseFingerprint: t.fingerprint,
        changes: [{
          op: 'createFile',
          path: 'tracks/track_drums.json',
          content: JSON.stringify({id: 'track_drums', name: 'Trap Drums'}),
        }],
      })]}),
    ]);

    const result = await askCopilotAgent({message: 'add trap drums', tree: t}, {env: ENV, fetchImpl: impl});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.turns).toBe(2);
      expect(result.patch?.summary).toBe('good track');
      const change = result.patch?.changes[0];
      expect(change).toMatchObject({op: 'createFile', path: 'tracks/track_drums.json'});
    }
  });

  it('errors clearly when no project tree is provided', async () => {
    const result = await askCopilotAgent({message: 'hello'}, {env: ENV, fetchImpl: (async () => ({})) as unknown as typeof fetch});
    expect(result.ok).toBe(false);
  });

  it('returns an answer_copilot payload (options/actions) as a terminal answer', async () => {
    const t = tree();
    const {impl} = mockFetch([
      chat({content: null, tool_calls: [toolCall('answer_copilot', {
        text: 'Here are two bass ideas.',
        actions: [{type: 'show_ui_guide', targetId: 'add-track-button'}],
        midiOptions: [{
          id: 'b1', label: 'Root', role: 'bassline', description: 'd',
          startBeat: 0, lengthBeats: 4, target: {instrumentId: 'bass_growly', presetId: 'growly_bass_lite'},
          notes: [{note: 40, velocity: 100, startBeat: 0, lengthBeats: 1}],
        }],
      })]}),
    ]);
    const result = await askCopilotAgent({message: 'give me a bassline', tree: t}, {env: ENV, fetchImpl: impl});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch).toBeNull();
      expect(result.text).toContain('bass ideas');
      expect(result.answer?.midiOptions).toHaveLength(1);
      expect(result.answer?.actions).toHaveLength(1);
    }
  });

  it('returns both a patch and an answer emitted in the same final turn', async () => {
    const t = tree();
    const projectHash = t.index.find(e => e.path === 'project.json')!.contentHash;
    const {impl} = mockFetch([
      chat({content: null, tool_calls: [
        toolCall('submit_project_patch', {
          summary: 'bpm', baseFingerprint: t.fingerprint,
          changes: [{op: 'mergeFields', path: 'project.json', beforeHash: projectHash, fields: {bpm: 128}}],
        }),
        toolCall('answer_copilot', {text: 'Set the tempo and pointed you at the mixer.', actions: []}),
      ]}),
    ]);
    const result = await askCopilotAgent({message: 'set bpm 128 and show mixer', tree: t}, {env: ENV, fetchImpl: impl});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch?.changes[0]).toMatchObject({path: 'project.json'});
      expect(result.answer).toBeDefined();
      expect(result.text).toContain('Set the tempo'); // answer text wins over patch summary
      expect(result.turns).toBe(1);
    }
  });

  it('repairs an empty answer_copilot by feeding the problem back and continuing', async () => {
    const t = tree();
    const {impl} = mockFetch([
      chat({content: null, tool_calls: [toolCall('answer_copilot', {text: '', actions: []})]}),
      chat({content: null, tool_calls: [toolCall('answer_copilot', {text: 'Here you go.', actions: []})]}),
    ]);
    const result = await askCopilotAgent({message: 'help', tree: t}, {env: ENV, fetchImpl: impl});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('Here you go');
      expect(result.turns).toBe(2);
    }
  });

  it('nudges a reasoning-only first turn instead of failing Build mode', async () => {
    const t = tree();
    const {impl, bodies} = mockFetch([
      chat({content: null, reasoning: 'I need to inspect the project first.'}),
      chat({content: null, tool_calls: [toolCall('answer_copilot', {text: 'I can structure the existing clip without generating music.', actions: []})]}),
    ]);

    const result = await askCopilotAgent(
      {message: 'build structure without generating music', tree: t},
      {env: ENV, fetchImpl: impl},
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('existing clip');
      expect(result.turns).toBe(2);
    }
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[1].messages)).toContain('You returned nothing usable');
  });
});
