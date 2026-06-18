import {runAskAudioTool, type NativeCommandFn} from '../electron/askAudioTools';
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

function audioTree(): ApcAgentTree {
  return buildTree({
    'clips/vox.json': {id: 'vox', type: 'audio', name: 'Lead Vocal', audioFilePath: 'recordings/vox.wav'},
    'clips/inst.json': {id: 'inst', type: 'audio', name: 'Instrumental', audioFilePath: 'recordings/inst.wav'},
    'clips/ref.json': {id: 'ref', type: 'audio', name: 'Reference', audioFilePath: 'recordings/ref.wav'},
    'clips/midi.json': {id: 'midi', type: 'midi', name: 'Synth', notes: [{}, {}]},
  });
}

type NativePayload = Record<string, unknown>;

/** Native bridge mock: maps command -> response data, wrapped in the {ok,data} envelope. */
function nativeMock(handlers: Record<string, (payload: NativePayload) => unknown>): {send: NativeCommandFn; calls: Array<{command: string; payload: NativePayload}>} {
  const calls: Array<{command: string; payload: NativePayload}> = [];
  const send: NativeCommandFn = (command, payloadJson) => {
    const payload = JSON.parse(payloadJson);
    calls.push({command, payload});
    const handler = handlers[command];
    if (!handler) {
      return JSON.stringify({ok: false, command, error: {code: 'unknown_command', message: 'no'}});
    }
    return JSON.stringify({ok: true, command, data: handler(payload)});
  };
  return {send, calls};
}

const BANDS = [
  {lowHz: 20, highHz: 120, energyDb: -10},
  {lowHz: 120, highHz: 250, energyDb: -14},
  {lowHz: 250, highHz: 2000, energyDb: -20},
  {lowHz: 2000, highHz: 8000, energyDb: -30},
];

describe('runAskAudioTool', () => {
  it('measures loudness of an audio clip and builds a loudness report', () => {
    const {send, calls} = nativeMock({
      measure_loudness: () => ({integratedLufs: -14.2, shortTermLufs: -12.0, rmsDb: -18.3, peakDb: -1.1}),
    });
    const out = runAskAudioTool(audioTree(), send, 'measure_loudness', {clipId: 'vox'});
    expect(out?.result).toMatchObject({available: true, integratedLufs: -14.2});
    expect(out?.report?.kind).toBe('loudness');
    expect(out?.report?.metrics.find(metric => metric.label === 'Integrated')?.value).toContain('LUFS');
    expect(calls[0]).toMatchObject({command: 'measure_loudness', payload: {audioPath: 'recordings/vox.wav'}});
  });

  it('reports unavailable for a MIDI clip (no audio)', () => {
    const {send} = nativeMock({measure_loudness: () => ({integratedLufs: -10})});
    const out = runAskAudioTool(audioTree(), send, 'measure_loudness', {clipId: 'midi'});
    expect(out?.result).toMatchObject({available: false});
    expect(out?.report).toBeUndefined();
  });

  it('degrades gracefully when the engine lacks the command', () => {
    const {send} = nativeMock({}); // every command -> unknown_command
    const out = runAskAudioTool(audioTree(), send, 'measure_loudness', {clipId: 'vox'});
    expect(out?.result).toMatchObject({available: false});
    expect((out?.result as {reason: string}).reason).toMatch(/does not support/);
  });

  it('analyzes masking between two audio clips, loudness-matched', () => {
    const {send, calls} = nativeMock({
      get_spectrum_bands: (payload) => ({
        bands: payload.audioPath === 'recordings/inst.wav'
          ? BANDS.map((band, i) => ({...band, energyDb: band.energyDb + (i === 0 ? 8 : 0)}))
          : BANDS,
      }),
    });
    const out = runAskAudioTool(audioTree(), send, 'analyze_masking', {clipIdA: 'vox', clipIdB: 'inst'});
    expect(out?.result).toMatchObject({available: true});
    expect(out?.report?.kind).toBe('masking');
    // The instrumental is +8 dB in the lowest band → that band ranks worst.
    expect(out?.report?.bars?.[0].label).toContain('20');
    expect(calls.every(call => call.payload.loudnessMatch === true)).toBe(true);
  });

  it('compares low end against a reference below the crossover', () => {
    const {send} = nativeMock({
      get_spectrum_bands: (payload) => ({
        bands: payload.audioPath === 'recordings/ref.wav'
          ? BANDS
          : BANDS.map((band, i) => ({...band, energyDb: band.energyDb + (i === 0 ? 4 : 0)})),
      }),
    });
    const out = runAskAudioTool(audioTree(), send, 'compare_reference_low_end', {
      projectClipId: 'vox',
      referenceClipId: 'ref',
      crossoverHz: 200,
    });
    expect(out?.report?.kind).toBe('reference');
    // Project clip is +4 dB in the sub band vs the reference.
    expect((out?.result as {averageLowDeltaDb: number}).averageLowDeltaDb).toBeGreaterThan(0);
  });

  it('returns unavailable (not a crash) when no native bridge is provided', () => {
    const out = runAskAudioTool(audioTree(), undefined, 'measure_loudness', {clipId: 'vox'});
    expect(out?.result).toMatchObject({available: false});
  });

  it('returns null for a non-audio tool name', () => {
    const {send} = nativeMock({});
    expect(runAskAudioTool(audioTree(), send, 'get_session_summary', {})).toBeNull();
  });
});
