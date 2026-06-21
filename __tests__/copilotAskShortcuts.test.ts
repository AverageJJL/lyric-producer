import {buildAskShortcut} from '../electron/copilotAskShortcuts';
import type {NativeCommandFn} from '../electron/askAudioTools';
import type {ApcAgentTree} from '../electron/copilotAgentTools';

function tree(files: Record<string, unknown>): ApcAgentTree {
  const stringFiles: Record<string, string> = {};
  const index: ApcAgentTree['index'] = [];
  for (const [path, value] of Object.entries(files)) {
    const content = JSON.stringify(value);
    stringFiles[path] = content;
    index.push({path, bytes: content.length, contentHash: `h-${path}`});
  }
  return {fingerprint: 'fp', files: stringFiles, index};
}

function audioTree(): ApcAgentTree {
  return tree({
    'manifest.json': {format: 'apc', version: 1, trackIds: ['t1', 't2', 't3'], clipIds: ['song', 'vox', 'ref'], patternIds: []},
    'project.json': {bpm: 120},
    'timeline.json': {timeSignature: {numerator: 4, denominator: 4}, sections: []},
    'tracks/t1.json': {id: 't1', name: 'Song', type: 'voice_audio'},
    'tracks/t2.json': {id: 't2', name: 'Vocal', type: 'voice_audio'},
    'tracks/t3.json': {id: 't3', name: 'Reference', type: 'voice_audio'},
    'clips/song.json': {
      id: 'song', trackId: 't1', name: 'Imported Song', type: 'audio',
      startBeat: 0, lengthBeats: 64, audioFilePath: 'imports/song.mp3',
    },
    'clips/vox.json': {
      id: 'vox', trackId: 't2', name: 'Lead Vocal', type: 'audio',
      startBeat: 0, lengthBeats: 32, audioFilePath: 'imports/vox.mp3',
    },
    'clips/ref.json': {
      id: 'ref', trackId: 't3', name: 'Reference Track', type: 'audio',
      startBeat: 0, lengthBeats: 64, audioFilePath: 'imports/ref.mp3',
    },
  });
}

type NativePayload = Record<string, unknown>;

function nativeMock(): {send: NativeCommandFn; calls: Array<{command: string; payload: NativePayload}>} {
  const calls: Array<{command: string; payload: NativePayload}> = [];
  const bands = [
    {lowHz: 20, highHz: 120, energyDb: -12},
    {lowHz: 120, highHz: 250, energyDb: -18},
    {lowHz: 250, highHz: 2000, energyDb: -30},
  ];
  const send: NativeCommandFn = (command, payloadJson) => {
    const payload = JSON.parse(payloadJson);
    calls.push({command, payload});
    if (command === 'measure_loudness') {
      return JSON.stringify({ok: true, command, data: {integratedLufs: -13.2, peakDb: -1.0}});
    }
    if (command === 'get_spectrum_bands') {
      const boost = payload.audioPath === 'imports/vox.mp3' ? 8 : payload.audioPath === 'imports/ref.mp3' ? -4 : 0;
      return JSON.stringify({ok: true, command, data: {bands: bands.map(band => ({...band, energyDb: band.energyDb + boost}))}});
    }
    return JSON.stringify({ok: false, command, error: {code: 'unknown_command'}});
  };
  return {send, calls};
}

describe('buildAskShortcut', () => {
  it('answers block inventory prompts with a blocks report', () => {
    const out = buildAskShortcut('Read my audio blocks. What clips are in this session?', audioTree(), undefined);
    expect(out?.text).toContain('Imported Song');
    expect(out?.text).toContain('Good follow-up demos');
    expect(out?.reports.map(report => report.kind)).toContain('blocks');
  });

  it('routes loudness prompts to the native measurement tool', () => {
    const {send, calls} = nativeMock();
    const out = buildAskShortcut('How loud is the first audio block?', audioTree(), send);
    expect(out?.text).toContain('-13.2 LUFS');
    expect(out?.reports.map(report => report.kind)).toContain('loudness');
    expect(calls[0]).toMatchObject({command: 'measure_loudness', payload: {audioPath: 'imports/song.mp3'}});
  });

  it('routes masking prompts to spectral measurement over an overlap window', () => {
    const {send, calls} = nativeMock();
    const out = buildAskShortcut('What is masking the first audio block around beat 16?', audioTree(), send);
    expect(out?.reports.map(report => report.kind)).toContain('masking');
    expect(calls.map(call => call.command)).toEqual(['get_spectrum_bands', 'get_spectrum_bands']);
    expect(calls[0].payload).toMatchObject({startBeat: 12, lengthBeats: 8, loudnessMatch: true});
  });

  it('preserves target/masker order for "X masks in Y" wording', () => {
    const {send, calls} = nativeMock();
    const out = buildAskShortcut('What frequencies does Lead Vocal mask in Imported Song around beat 16?', audioTree(), send);
    expect(out?.reports[0].title).toContain('Lead Vocal over Imported Song');
    expect(calls[0].payload.audioPath).toBe('imports/song.mp3');
    expect(calls[1].payload.audioPath).toBe('imports/vox.mp3');
  });

  it('uses a reference-named block as the low-end reference', () => {
    const {send, calls} = nativeMock();
    const out = buildAskShortcut('Compare the low end of the first track to the reference', audioTree(), send);
    expect(out?.reports.map(report => report.kind)).toContain('reference');
    expect(calls[0].payload.audioPath).toBe('imports/song.mp3');
    expect(calls[1].payload.audioPath).toBe('imports/ref.mp3');
  });

  it('returns null for prompts that need the normal agent loop', () => {
    expect(buildAskShortcut('why does this chorus feel flat?', audioTree(), undefined)).toBeNull();
  });
});
