import {sendNativeAudioCommand} from './NativeAudioEngine';

export type InstrumentParameterId = 'filter.cutoff' | 'filter.resonance';

export type NativeInstrumentParameterResult = {
  trackId: string;
  targetType: 'instrument';
  parameterId: InstrumentParameterId;
  value: number;
};

type SetInstrumentParameterRequest = {
  trackId: string;
  parameterId: InstrumentParameterId;
  value: number;
};

function isInstrumentParameterId(value: unknown): value is InstrumentParameterId {
  return value === 'filter.cutoff' || value === 'filter.resonance';
}

function isResult(value: unknown): value is NativeInstrumentParameterResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<NativeInstrumentParameterResult>;
  return (
    typeof candidate.trackId === 'string' &&
    candidate.targetType === 'instrument' &&
    isInstrumentParameterId(candidate.parameterId) &&
    typeof candidate.value === 'number' &&
    Number.isFinite(candidate.value)
  );
}

export function setNativeInstrumentParameter(
  request: SetInstrumentParameterRequest,
): NativeInstrumentParameterResult | null {
  const response = sendNativeAudioCommand('set_track_instrument_param', request);
  if (!response) {
    return null;
  }

  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: unknown};
    if (parsed.ok && isResult(parsed.data)) {
      return parsed.data;
    }
  } catch {
    return null;
  }

  return null;
}
