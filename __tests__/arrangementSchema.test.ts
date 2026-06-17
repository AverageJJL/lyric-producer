import {
  parseArrangementOperationsJson,
  validateArrangementOperationsPayload,
} from '../src/orchestration/arrangementSchema';
import {createEmptyPattern} from '../src/music/drumPatterns';

describe('arrangement operation schema validation', () => {
  it('parses valid operation arrays from JSON', () => {
    const result = parseArrangementOperationsJson(JSON.stringify({
      operations: [
        {
          op: 'createTrack',
          templateId: 'virtual_instrument',
          instrumentId: 'synth_lead',
        },
        {
          op: 'upsertMidiClip',
          clip: {
            id: 'clip-lead',
            trackId: 'track-lead',
            name: 'Lead',
            startBeat: 0,
            lengthBeats: 4,
            notes: [
              {note: 60, velocity: 96, startBeat: 0, lengthBeats: 1},
            ],
          },
        },
        {
          op: 'setSections',
          sections: [
            {id: 'verse', name: 'Verse', startBeat: 0, lengthBeats: 16},
          ],
        },
        {
          op: 'setPerformanceMode',
          mode: 'looper',
          looperLengthBars: 8,
        },
        {
          op: 'createSamplerFromSlices',
          sourceClipId: 'clip-audio',
          trackId: 'track-sampler',
          trackName: 'Vocal Sampler',
          clipId: 'clip-slices',
          clipName: 'Vocal Chops',
          startBeat: 8,
          slices: [
            {name: 'Ah', sourceStartBeat: 0, sourceLengthBeats: 0.5, triggerNote: 48},
          ],
        },
        {
          op: 'setClipLocked',
          clipId: 'clip-lead',
          isLocked: true,
        },
      ],
    }));

    expect(result).toMatchObject({ok: true});
    expect(result.ok ? result.operations.map(operation => operation.op) : []).toEqual([
      'createTrack',
      'upsertMidiClip',
      'setSections',
      'setPerformanceMode',
      'createSamplerFromSlices',
      'setClipLocked',
    ]);
  });

  it('validates drum patterns and drum clips without MIDI note fields', () => {
    const pattern = createEmptyPattern('Pattern A', 'pattern-a');
    pattern.steps.kick[0] = true;

    const result = validateArrangementOperationsPayload([
      {op: 'upsertDrumPattern', pattern},
      {
        op: 'upsertDrumClip',
        clip: {
          id: 'clip-drums',
          trackId: 'track-drums',
          name: 'Drums',
          startBeat: 0,
          lengthBeats: 4,
          patternId: 'pattern-a',
        },
      },
    ]);

    expect(result).toMatchObject({ok: true});
    expect(result.ok ? result.operations[1] : null).toMatchObject({
      op: 'upsertDrumClip',
      clip: {patternId: 'pattern-a'},
    });
  });

  it('rejects malformed JSON and unsupported restore operations', () => {
    expect(parseArrangementOperationsJson('{')).toMatchObject({
      ok: false,
      errors: [{path: '$'}],
    });

    const result = validateArrangementOperationsPayload([
      {op: 'restoreBlock', block: {id: 'unsafe'}},
    ]);

    expect(result).toMatchObject({ok: false});
    expect(result.ok ? [] : result.errors).toContainEqual({
      path: 'operations[0].op',
      message: 'Unsupported operation "restoreBlock".',
    });
  });

  it('rejects extra fields, invalid notes, and malformed root payloads', () => {
    const result = validateArrangementOperationsPayload({
      operations: [
        {
          op: 'upsertMidiClip',
          clip: {
            id: 'clip-a',
            trackId: 'track-a',
            name: 'Lead',
            startBeat: 0,
            lengthBeats: 4,
            notes: [{note: 200, velocity: 96, startBeat: 0, lengthBeats: 1}],
            audioFilePath: '/tmp/not-allowed.wav',
          },
        },
      ],
      prose: 'This should not be part of the execution block.',
    });

    expect(result).toMatchObject({ok: false});
    const errors = result.ok ? [] : result.errors;
    expect(errors).toEqual(expect.arrayContaining([
      {path: '$.prose', message: 'Unexpected field.'},
      {path: 'operations[0].clip.audioFilePath', message: 'Unexpected field.'},
      {path: 'operations[0].clip.notes[0].note', message: 'Expected MIDI note 0-127.'},
    ]));
  });

  it('rejects invalid looper mode lengths', () => {
    const result = validateArrangementOperationsPayload([
      {op: 'setPerformanceMode', mode: 'looper', looperLengthBars: 16},
    ]);

    expect(result).toMatchObject({ok: false});
    expect(result.ok ? [] : result.errors).toContainEqual({
      path: 'operations[0].looperLengthBars',
      message: 'Expected looperLengthBars 4 or 8.',
    });
  });

  it('rejects malformed sampler slice operations', () => {
    const result = validateArrangementOperationsPayload([
      {
        op: 'createSamplerFromSlices',
        sourceClipId: 'clip-audio',
        trackId: 'track-sampler',
        trackName: 'Sampler',
        clipId: 'clip-slices',
        clipName: 'Slices',
        startBeat: 0,
        slices: [{sourceStartBeat: 0, sourceLengthBeats: 0.5, triggerNote: 200}],
      },
    ]);

    expect(result).toMatchObject({ok: false});
    expect(result.ok ? [] : result.errors).toContainEqual({
      path: 'operations[0].slices[0].triggerNote',
      message: 'Expected MIDI note 0-127.',
    });
  });
});
