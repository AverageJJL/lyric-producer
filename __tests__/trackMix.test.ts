import {buildNativeTrackPayload} from '../src/native/trackPayload';
import {createTrackFromTemplate} from '../src/music/trackTemplates';
import {
  DEFAULT_MASTER_PAN,
  DEFAULT_MASTER_VOLUME_DB,
  DEFAULT_TRACK_GAIN_DB,
  DEFAULT_TRACK_PAN,
  DEFAULT_TRACK_VOLUME_DB,
  MAX_TRACK_GAIN_DB,
  MAX_TRACK_PAN,
  MAX_TRACK_VOLUME_DB,
  MIN_TRACK_EFFECTIVE_VOLUME_DB,
  MIN_TRACK_GAIN_DB,
  MIN_TRACK_PAN,
  MIN_TRACK_VOLUME_DB,
  normalizeTrackMix,
} from '../src/music/trackMix';
import {buildNativeMasterMixPayload} from '../src/native/masterMixPayload';
import type {DAWTrack} from '../src/store/useDAWStore';

const baseTrack: DAWTrack = {
  id: 'track-1',
  name: 'Lead',
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isMuted: false,
  isSolo: false,
  isRecordArmed: false,
  isLocked: false,
};

describe('track mix state', () => {
  it('seeds new tracks with neutral mix values', () => {
    const track = createTrackFromTemplate('virtual_instrument', 0);

    expect(track.volumeDb).toBe(DEFAULT_TRACK_VOLUME_DB);
    expect(track.pan).toBe(DEFAULT_TRACK_PAN);
    expect(track.gainDb).toBe(DEFAULT_TRACK_GAIN_DB);
  });

  it('normalizes missing and out-of-range mix fields', () => {
    expect(normalizeTrackMix(baseTrack)).toEqual({
      volumeDb: DEFAULT_TRACK_VOLUME_DB,
      pan: DEFAULT_TRACK_PAN,
      gainDb: DEFAULT_TRACK_GAIN_DB,
      effectiveVolumeDb: DEFAULT_TRACK_VOLUME_DB + DEFAULT_TRACK_GAIN_DB,
    });

    expect(
      normalizeTrackMix({
        volumeDb: 120,
        pan: -4,
        gainDb: -80,
      }),
    ).toEqual({
      volumeDb: MAX_TRACK_VOLUME_DB,
      pan: MIN_TRACK_PAN,
      gainDb: MIN_TRACK_GAIN_DB,
      effectiveVolumeDb: -18,
    });

    expect(normalizeTrackMix({volumeDb: -100, gainDb: -80}).effectiveVolumeDb)
      .toBe(MIN_TRACK_EFFECTIVE_VOLUME_DB);
  });

  it('includes normalized mix values in native track payloads', () => {
    expect(
      buildNativeTrackPayload({
        ...baseTrack,
        volumeDb: -70,
        pan: 2,
        gainDb: 40,
      }),
    ).toMatchObject({
      id: 'track-1',
      volumeDb: MIN_TRACK_VOLUME_DB,
      pan: MAX_TRACK_PAN,
      gainDb: MAX_TRACK_GAIN_DB,
      effectiveVolumeDb: -36,
    });
  });

  it('normalizes master mix payloads for the native bridge', () => {
    expect(buildNativeMasterMixPayload({})).toEqual({
      volumeDb: DEFAULT_MASTER_VOLUME_DB,
      pan: DEFAULT_MASTER_PAN,
    });

    expect(buildNativeMasterMixPayload({masterVolumeDb: 99, masterPan: -2})).toEqual({
      volumeDb: MAX_TRACK_VOLUME_DB,
      pan: MIN_TRACK_PAN,
    });
  });
});
