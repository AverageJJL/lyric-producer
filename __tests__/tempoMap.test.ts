import {
  meterMapEventAtBeat,
  normalizeMapBeat,
  normalizeMeterMap,
  normalizeTempoBpm,
  normalizeTempoMap,
  removeMeterMapEventAtBeat,
  removeTempoMapEventAtBeat,
  upsertMeterMapEvent,
  upsertTempoMapEvent,
} from '../src/transport/tempoMap';
import {
  tempoMapBeatAtSeconds,
  tempoMapBpmAtBeat,
  tempoMapSecondsAtBeat,
  tempoMapSecondsBetweenBeats,
} from '../src/transport/tempoMapTiming';

describe('tempo and meter map helpers', () => {
  it('clamps project tempo and rounds map beats deterministically', () => {
    expect(normalizeTempoBpm(12)).toBe(20);
    expect(normalizeTempoBpm(301)).toBe(300);
    expect(normalizeTempoBpm(127.4)).toBe(127);
    expect(normalizeMapBeat(4.1236)).toBe(4.124);
    expect(normalizeMapBeat(-8)).toBe(0);
  });

  it('normalizes tempo map events by beat', () => {
    const normalized = normalizeTempoMap([
      {id: 'late', beat: 8, bpm: 140, ramp: 'linear'},
      {id: 'bad'},
      {beat: 0, bpm: 12, ramp: 'curve'},
      {beat: 8, bpm: 126, ramp: 'jump'},
    ]);

    expect(normalized).toEqual([
      {id: 'tempo-0_000', beat: 0, bpm: 20, ramp: 'jump'},
      {id: 'tempo-8_000', beat: 8, bpm: 126, ramp: 'jump'},
    ]);
  });

  it('upserts and removes tempo events at the normalized beat', () => {
    const withEvent = upsertTempoMapEvent([], 7.9999, 132, 'linear');
    expect(withEvent).toEqual([
      {id: 'tempo-8_000', beat: 8, bpm: 132, ramp: 'linear'},
    ]);

    expect(removeTempoMapEventAtBeat(withEvent, 8)).toEqual([]);
  });

  it('normalizes, upserts, and removes meter events', () => {
    const withEvents = normalizeMeterMap([
      {beat: 12, timeSignature: {numerator: 7, denominator: 8}},
      {beat: 0, timeSignature: {numerator: 13, denominator: 5}},
    ]);

    expect(withEvents).toEqual([
      {id: 'meter-0_000', beat: 0, timeSignature: {numerator: 4, denominator: 4}},
      {id: 'meter-12_000', beat: 12, timeSignature: {numerator: 7, denominator: 8}},
    ]);

    const upserted = upsertMeterMapEvent(withEvents, 4, {numerator: 3, denominator: 8});
    expect(meterMapEventAtBeat(upserted, 4)).toMatchObject({
      beat: 4,
      timeSignature: {numerator: 3, denominator: 8},
    });
    expect(removeMeterMapEventAtBeat(upserted, 12)).toHaveLength(2);
  });

  it('converts beats and seconds through jump tempo map events', () => {
    const tempoMap = [
      {id: 'tempo-4', beat: 4, bpm: 60, ramp: 'jump' as const},
    ];

    expect(tempoMapSecondsAtBeat(4, 120, tempoMap)).toBe(2);
    expect(tempoMapSecondsAtBeat(8, 120, tempoMap)).toBe(6);
    expect(tempoMapSecondsBetweenBeats(4, 8, 120, tempoMap)).toBe(4);
    expect(tempoMapBeatAtSeconds(6, 120, tempoMap)).toBe(8);
    expect(tempoMapBpmAtBeat(6, 120, tempoMap)).toBe(60);
  });

  it('converts linear tempo ramps without collapsing them to a jump', () => {
    const tempoMap = [
      {id: 'tempo-0', beat: 0, bpm: 120, ramp: 'linear' as const},
      {id: 'tempo-4', beat: 4, bpm: 60, ramp: 'jump' as const},
    ];

    const rampSeconds = tempoMapSecondsBetweenBeats(0, 4, 120, tempoMap);
    expect(rampSeconds).toBeGreaterThan(2);
    expect(rampSeconds).toBeLessThan(4);
    expect(tempoMapBeatAtSeconds(rampSeconds, 120, tempoMap)).toBe(4);
    expect(tempoMapBpmAtBeat(2, 120, tempoMap)).toBe(90);
  });

  it('recomputes timing when a caller mutates an existing tempo map array', () => {
    const tempoMap = [
      {id: 'tempo-4', beat: 4, bpm: 60, ramp: 'jump' as const},
    ];

    expect(tempoMapBpmAtBeat(6, 120, tempoMap)).toBe(60);

    tempoMap[0] = {id: 'tempo-4', beat: 4, bpm: 180, ramp: 'jump'};

    expect(tempoMapBpmAtBeat(6, 120, tempoMap)).toBe(180);
  });
});
