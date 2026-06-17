import {
  DEFAULT_RECORDING_COUNT_IN_BEATS,
  DEFAULT_RECORDING_LATENCY_COMPENSATION_MS,
  DEFAULT_RECORDING_PRE_ROLL_BEATS,
  AUTO_RECORDING_LATENCY_COMPENSATION_MS,
  normalizeRecordingLatencyCompensationMs,
  normalizeRecordingCountInBeats,
  normalizeRecordingPreRollBeats,
  recordingBeatRangeSeconds,
  recordingCountInSeconds,
  resolvedRecordingLatencyCompensationMs,
  recordingLatencyCompensationBeats,
  recordingPreRollSeconds,
} from '../src/transport/recordingPreferences';

describe('recording preferences', () => {
  it('normalizes count-in choices and converts beats to seconds', () => {
    expect(normalizeRecordingCountInBeats(4)).toBe(4);
    expect(normalizeRecordingCountInBeats(3)).toBe(DEFAULT_RECORDING_COUNT_IN_BEATS);
    expect(normalizeRecordingPreRollBeats(8)).toBe(8);
    expect(normalizeRecordingPreRollBeats(3)).toBe(DEFAULT_RECORDING_PRE_ROLL_BEATS);
    expect(normalizeRecordingLatencyCompensationMs(50)).toBe(50);
    expect(normalizeRecordingLatencyCompensationMs(-1)).toBe(AUTO_RECORDING_LATENCY_COMPENSATION_MS);
    expect(normalizeRecordingLatencyCompensationMs(7)).toBe(DEFAULT_RECORDING_LATENCY_COMPENSATION_MS);
    expect(resolvedRecordingLatencyCompensationMs(-1, 37.5)).toBe(37.5);
    expect(resolvedRecordingLatencyCompensationMs(25, 37.5)).toBe(25);
    expect(recordingCountInSeconds(4, 120)).toBe(2);
    expect(recordingCountInSeconds(4, 0)).toBe(2);
    expect(recordingPreRollSeconds(8, 120)).toBe(4);
    expect(recordingLatencyCompensationBeats(50, 120)).toBe(0.1);
  });

  it('uses tempo-map timing for recording lead-ins and punch ranges', () => {
    const tempoMap = [{id: 'slow', beat: 4, bpm: 60, ramp: 'jump' as const}];

    expect(recordingCountInSeconds(4, 120, tempoMap, 4)).toBe(4);
    expect(recordingPreRollSeconds(4, 120, tempoMap, 8)).toBe(4);
    expect(recordingBeatRangeSeconds(4, 8, 120, tempoMap)).toBe(4);
    expect(recordingLatencyCompensationBeats(50, 120, tempoMap, 4)).toBe(0.05);
  });
});
