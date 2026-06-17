import {
  clampTrackPan,
  clampTrackVolumeDb,
  DEFAULT_MASTER_PAN,
  DEFAULT_MASTER_VOLUME_DB,
} from '../music/trackMix';

export type MasterMixState = {
  masterVolumeDb?: number;
  masterPan?: number;
};

export type NativeMasterMixPayload = {
  volumeDb: number;
  pan: number;
};

export function buildNativeMasterMixPayload(
  state: MasterMixState,
): NativeMasterMixPayload {
  return {
    volumeDb: clampTrackVolumeDb(state.masterVolumeDb ?? DEFAULT_MASTER_VOLUME_DB),
    pan: clampTrackPan(state.masterPan ?? DEFAULT_MASTER_PAN),
  };
}
