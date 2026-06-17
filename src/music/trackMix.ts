export const DEFAULT_TRACK_VOLUME_DB = 0;
export const DEFAULT_TRACK_PAN = 0;
export const DEFAULT_TRACK_GAIN_DB = 0;
export const DEFAULT_MASTER_VOLUME_DB = 0;
export const DEFAULT_MASTER_PAN = 0;

export const MIN_TRACK_VOLUME_DB = -60;
export const MAX_TRACK_VOLUME_DB = 6;
export const MIN_TRACK_GAIN_DB = -24;
export const MAX_TRACK_GAIN_DB = 24;
export const MIN_TRACK_PAN = -1;
export const MAX_TRACK_PAN = 1;
export const MIN_TRACK_EFFECTIVE_VOLUME_DB = -60;
export const MAX_TRACK_EFFECTIVE_VOLUME_DB = 12;

export type TrackMixState = {
  volumeDb?: number;
  pan?: number;
  gainDb?: number;
};

export type NormalizedTrackMix = {
  volumeDb: number;
  pan: number;
  gainDb: number;
  effectiveVolumeDb: number;
};

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampTrackVolumeDb(value: number): number {
  return clamp(finiteOr(value, DEFAULT_TRACK_VOLUME_DB), MIN_TRACK_VOLUME_DB, MAX_TRACK_VOLUME_DB);
}

export function clampTrackPan(value: number): number {
  return clamp(finiteOr(value, DEFAULT_TRACK_PAN), MIN_TRACK_PAN, MAX_TRACK_PAN);
}

export function clampTrackGainDb(value: number): number {
  return clamp(finiteOr(value, DEFAULT_TRACK_GAIN_DB), MIN_TRACK_GAIN_DB, MAX_TRACK_GAIN_DB);
}

export function normalizeTrackMix(track: TrackMixState): NormalizedTrackMix {
  const volumeDb = clampTrackVolumeDb(track.volumeDb);
  const pan = clampTrackPan(track.pan);
  const gainDb = clampTrackGainDb(track.gainDb);

  return {
    volumeDb,
    pan,
    gainDb,
    // The current native bridge has one Tracktion fader lane, so gain trim is
    // preserved separately in project state and combined only when sending mix
    // parameters to the engine.
    effectiveVolumeDb: clamp(
      volumeDb + gainDb,
      MIN_TRACK_EFFECTIVE_VOLUME_DB,
      MAX_TRACK_EFFECTIVE_VOLUME_DB,
    ),
  };
}
