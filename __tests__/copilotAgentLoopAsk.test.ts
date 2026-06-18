import {askCopilotAgent} from '../electron/copilotAgentLoop';
import type {ApcAgentTree} from '../electron/copilotAgentTools';

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

function askTree(): ApcAgentTree {
  return buildTree({
    'manifest.json': {format: 'apc', version: 1, trackIds: ['t1'], clipIds: ['vox'], patternIds: []},
    'project.json': {bpm: 124, scale: null},
    'timeline.json': {timeSignature: {numerator: 4, denominator: 4}, sections: []},
    'tracks/t1.json': {id: 't1', name: 'Vocal', type: 'voice_audio'},
    'clips/vox.json': {id: 'vox', trackId: 't1', name: 'Lead Vocal', type: 'audio', startBeat: 0, lengthBeats: 16, audioFilePath: 'recordings/vox.wav'},
  });
}

function toolCall(name: string, args: unknown) {
  return {id: `call-${name}`, type: 'function', function: {name, arguments: JSON.stringify(args)}};
}

function chat(message: Record<string, unknown>) {
  return {ok: true, status: 200, json: async () => ({choices: [{message}]})};
}

function mockFetch(queue: Array<{ok: boolean; status: number; json: () => Promise<unknown>}>) {
  const bodies: Array<Record<string, unknown>> = [];
  const impl = (async (_url: string, init: {body: string}) => {
    bodies.push(JSON.parse(init.body));
    return queue.shift() ?? {ok: false, status: 500, json: async () => ({})};
  }) as unknown as typeof fetch;
  return {impl, bodies};
}

function toolNamesFrom(body: Record<string, unknown>): string[] {
  return (body.tools as Array<{function: {name: string}}>).map(tool => tool.function.name);
}

const ENV = {OPENROUTER_API_KEY: 'test-key'} as NodeJS.ProcessEnv;

describe('askCopilotAgent — Ask (read-only) mode', () => {
  it('offers read-only analysis tools and withholds the editing tools', async () => {
    const {impl, bodies} = mockFetch([chat({content: 'You have one vocal track.'})]);
    await askCopilotAgent({message: 'what is in my session?', tree: askTree(), mode: 'ask'}, {env: ENV, fetchImpl: impl});
    const toolNames = toolNamesFrom(bodies[0]);
    expect(toolNames).toEqual(expect.arrayContaining(['get_session_summary', 'find_clips', 'measure_loudness', 'list_project_files']));
    expect(toolNames).not.toContain('submit_project_patch');
    expect(toolNames).not.toContain('answer_copilot');
  });

  it('runs a session-model tool and returns its report card with the answer', async () => {
    const {impl} = mockFetch([
      chat({content: null, tool_calls: [toolCall('get_session_summary', {})]}),
      chat({content: 'You have 1 track and 1 clip at 124 BPM.'}),
    ]);
    const result = await askCopilotAgent({message: 'summarize', tree: askTree(), mode: 'ask'}, {env: ENV, fetchImpl: impl});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('124 BPM');
      expect(result.reports?.map(report => report.kind)).toContain('summary');
      expect(result.patch).toBeNull();
    }
  });

  it('measures loudness through the native bridge handed to the loop', async () => {
    const calls: string[] = [];
    const sendNativeCommand = (command: string) => {
      calls.push(command);
      if (command === 'measure_loudness') {
        return JSON.stringify({ok: true, command, data: {integratedLufs: -13.5, peakDb: -0.8}});
      }
      return JSON.stringify({ok: false, command, error: {code: 'unknown_command'}});
    };
    const {impl} = mockFetch([
      chat({content: null, tool_calls: [toolCall('measure_loudness', {clipId: 'vox'})]}),
      chat({content: 'Your vocal sits at -13.5 LUFS.'}),
    ]);
    const result = await askCopilotAgent(
      {message: 'how loud is the vocal', tree: askTree(), mode: 'ask'},
      {env: ENV, fetchImpl: impl, sendNativeCommand},
    );
    expect(calls).toContain('measure_loudness');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reports?.map(report => report.kind)).toContain('loudness');
    }
  });

  it('refuses an edit if the model fabricates one in Ask mode', async () => {
    const {impl} = mockFetch([
      chat({content: null, tool_calls: [toolCall('submit_project_patch', {
        summary: 'sneaky', baseFingerprint: 'fp',
        changes: [{op: 'mergeFields', path: 'project.json', beforeHash: 'h-project.json', fields: {bpm: 200}}],
      })]}),
      chat({content: 'I can only answer questions in Ask mode.'}),
    ]);
    const result = await askCopilotAgent({message: 'set bpm 200', tree: askTree(), mode: 'ask'}, {env: ENV, fetchImpl: impl});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch).toBeNull();
      expect(result.text).toContain('Ask mode');
    }
  });

  it('still runs the editing Build path when mode is omitted', async () => {
    const {impl, bodies} = mockFetch([chat({content: 'Which track?'})]);
    await askCopilotAgent({message: 'make it louder', tree: askTree()}, {env: ENV, fetchImpl: impl});
    const toolNames = toolNamesFrom(bodies[0]);
    expect(toolNames).toContain('submit_project_patch');
    expect(toolNames).not.toContain('get_session_summary');
  });
});
