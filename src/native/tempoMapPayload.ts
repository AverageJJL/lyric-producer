import type {TimeSignature} from '../store/projectMetadata';
import {normalizeTimeSignature} from '../store/projectMetadata';
import {
  normalizeMeterMap,
  normalizeTempoBpm,
  normalizeTempoMap,
  type MeterMapEvent,
  type TempoMapEvent,
} from '../transport/tempoMap';

type TempoMapPayloadState = {
  bpm: number;
  timeSignature: TimeSignature;
  tempoMap: TempoMapEvent[];
  meterMap: MeterMapEvent[];
};

export function buildNativeTempoMapPayload(state: TempoMapPayloadState) {
  return {
    bpm: normalizeTempoBpm(state.bpm),
    timeSignature: normalizeTimeSignature(state.timeSignature),
    tempoMap: normalizeTempoMap(state.tempoMap),
    meterMap: normalizeMeterMap(state.meterMap),
  };
}
