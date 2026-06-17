import {
  AI_PRODUCER_SYSTEM_PROMPT,
  buildAiProducerHandoffPayload,
  mediaAttachmentsFromSnapshot,
} from '../src/orchestration/aiHandoffPayload';
import {
  emptyProjectSnapshot,
  snapshotFingerprint,
  type ProjectSnapshot,
} from '../src/arrangement/projectSnapshot';

function snapshotWithAudio(): ProjectSnapshot {
  return {
    ...emptyProjectSnapshot(),
    bpm: 128,
    blocks: [
      {
        id: 'clip-audio',
        trackId: 'track-voice',
        name: 'Voice Take',
        startBeat: 0,
        lengthBeats: 4,
        type: 'audio',
        color: '#c45c26',
        audioFilePath: 'recordings/voice.wav',
        absoluteAudioFilePath: '/tmp/musicapp/recordings/voice.wav',
        spectrogramPngPath: 'spectrograms/voice.png',
      },
    ],
  };
}

function snapshotWithLocks(): ProjectSnapshot {
  return {
    ...emptyProjectSnapshot(),
    tracks: [
      {
        id: 'track-locked',
        name: 'Locked Bass',
        isMuted: false,
        isSolo: false,
        type: 'software_instrument',
        instrumentId: 'synth_bass',
        presetId: 'bass_sub',
        isRecordArmed: false,
        isLocked: true,
      },
      {
        id: 'track-open',
        name: 'Open Lead',
        isMuted: false,
        isSolo: false,
        type: 'software_instrument',
        instrumentId: 'synth_lead',
        presetId: 'pop_lead',
        isRecordArmed: false,
        isLocked: false,
      },
    ],
    blocks: [
      {
        id: 'clip-in-locked-track',
        trackId: 'track-locked',
        name: 'Bass Phrase',
        startBeat: 0,
        lengthBeats: 4,
        type: 'midi',
        color: '#4a7fd4',
        notes: [],
      },
      {
        id: 'clip-locked',
        trackId: 'track-open',
        name: 'Lead Motif',
        startBeat: 4,
        lengthBeats: 4,
        type: 'midi',
        color: '#4a7fd4',
        isLocked: true,
        notes: [],
      },
    ],
  };
}

describe('AI producer handoff payload', () => {
  it('packages prompt, user instruction, snapshot context, WAV, and spectrogram references', () => {
    const snapshot = snapshotWithAudio();
    const result = buildAiProducerHandoffPayload({
      userInstruction: ' Add a supporting bass line. ',
      snapshot,
      createdAt: '2026-06-03T00:00:00.000Z',
      temperature: 0.75,
    });

    expect(result).toMatchObject({ok: true});
    if (!result.ok) {
      throw new Error('expected valid payload');
    }

    expect(result.payload).toMatchObject({
      schemaVersion: 1,
      createdAt: '2026-06-03T00:00:00.000Z',
      systemPrompt: AI_PRODUCER_SYSTEM_PROMPT,
      userInstruction: 'Add a supporting bass line.',
      temperature: 0.75,
    });
    expect(result.payload.project.snapshotFingerprint).toBe(snapshotFingerprint(snapshot));
    expect(result.payload.project.performance).toMatchObject({
      mode: 'linear',
      looperLengthBars: 4,
      looperLengthBeats: 16,
      circular: false,
    });
    expect(result.payload.media.wav).toEqual([{
      path: '/tmp/musicapp/recordings/voice.wav',
      clipId: 'clip-audio',
      trackId: 'track-voice',
      name: 'Voice Take',
      source: 'project_audio',
    }]);
    expect(result.payload.media.spectrogramPng).toEqual([{
      path: 'spectrograms/voice.png',
      clipId: 'clip-audio',
      trackId: 'track-voice',
      sourceWavPath: '/tmp/musicapp/recordings/voice.wav',
    }]);
  });

  it('packages looper mode as circular project context', () => {
    const snapshot: ProjectSnapshot = {
      ...emptyProjectSnapshot(),
      performanceMode: 'looper',
      looperLengthBars: 8,
      timeSignature: {numerator: 3, denominator: 4},
    };
    const result = buildAiProducerHandoffPayload({
      userInstruction: 'Add a bass overdub that loops cleanly.',
      snapshot,
    });

    expect(result).toMatchObject({ok: true});
    if (!result.ok) {
      throw new Error('expected valid payload');
    }
    expect(result.payload.systemPrompt).toContain('project.performance.mode');
    expect(result.payload.project.performance).toMatchObject({
      mode: 'looper',
      looperLengthBars: 8,
      looperLengthBeats: 24,
      circular: true,
    });
  });

  it('deduplicates snapshot and manual media attachments by path', () => {
    const result = buildAiProducerHandoffPayload({
      userInstruction: 'Use this vocal.',
      snapshot: snapshotWithAudio(),
      wavAttachments: [
        {path: '/tmp/musicapp/recordings/voice.wav', source: 'user_capture'},
        {path: '/tmp/musicapp/reference.wav', source: 'reference_bounce'},
      ],
      spectrogramAttachments: [
        {path: 'spectrograms/voice.png'},
        {path: 'spectrograms/reference.png', sourceWavPath: '/tmp/musicapp/reference.wav'},
      ],
    });

    expect(result).toMatchObject({ok: true});
    const payload = result.ok ? result.payload : null;
    expect(payload?.media.wav.map(item => item.path)).toEqual([
      '/tmp/musicapp/recordings/voice.wav',
      '/tmp/musicapp/reference.wav',
    ]);
    expect(payload?.media.spectrogramPng.map(item => item.path)).toEqual([
      'spectrograms/voice.png',
      'spectrograms/reference.png',
    ]);
  });

  it('lists locked tracks and clips as non-mutable context', () => {
    const result = buildAiProducerHandoffPayload({
      userInstruction: 'Add around the locked parts.',
      snapshot: snapshotWithLocks(),
    });

    expect(result).toMatchObject({ok: true});
    const locks = result.ok ? result.payload.project.constraintLocks : null;
    expect(result.ok ? result.payload.systemPrompt : '').toContain('project.constraintLocks');
    expect(locks?.nonMutableTracks).toEqual([
      {
        trackId: 'track-locked',
        name: 'Locked Bass',
        type: 'software_instrument',
        reason: 'track_locked',
      },
    ]);
    expect(locks?.nonMutableClips).toEqual([
      {
        clipId: 'clip-in-locked-track',
        trackId: 'track-locked',
        name: 'Bass Phrase',
        type: 'midi',
        reason: 'parent_track_locked',
      },
      {
        clipId: 'clip-locked',
        trackId: 'track-open',
        name: 'Lead Motif',
        type: 'midi',
        reason: 'clip_locked',
      },
    ]);
  });

  it('rejects empty instructions, invalid temperature, and wrong media extensions', () => {
    const result = buildAiProducerHandoffPayload({
      userInstruction: '  ',
      snapshot: emptyProjectSnapshot(),
      temperature: 3,
      wavAttachments: [{path: '/tmp/not-a-wav.mp3', source: 'user_capture'}],
      spectrogramAttachments: [{path: '/tmp/not-a-png.jpg'}],
    });

    expect(result).toMatchObject({ok: false});
    expect(result.ok ? [] : result.errors).toEqual(expect.arrayContaining([
      {path: 'userInstruction', message: 'Expected non-empty user instruction text.'},
      {path: 'temperature', message: 'Expected a finite temperature from 0 to 2.'},
      {path: 'media.wav[0].path', message: 'Expected a .wav path reference.'},
      {path: 'media.spectrogramPng[0].path', message: 'Expected a .png path reference.'},
    ]));
  });

  it('extracts media references from a project snapshot without reading audio', () => {
    expect(mediaAttachmentsFromSnapshot(snapshotWithAudio())).toMatchObject({
      wav: [{path: '/tmp/musicapp/recordings/voice.wav'}],
      spectrogramPng: [{path: 'spectrograms/voice.png'}],
    });
  });
});
