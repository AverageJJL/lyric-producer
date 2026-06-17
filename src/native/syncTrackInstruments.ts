import {
  resolveNativeInstrumentAssignment,
  usesSampleKitEngine,
} from '../music/instruments';
import {playableTracks} from '../music/trackOrganization';
import type { DAWTrack } from '../store/useDAWStore';
import { sendNativeAudioCommand } from './NativeAudioEngine';

/** Single source of truth for pushing track instrument state to the C++ engine. */
export function syncTrackInstrumentToEngine(track: DAWTrack): void {
  if (track.type === 'voice_audio') {
    return;
  }

  const assignment = resolveNativeInstrumentAssignment(track);
  if (!assignment) {
    return;
  }

  sendNativeAudioCommand('assign_track_instrument', {
    trackId: track.id,
    instrument: assignment.instrument,
    presetId: assignment.presetId,
    params: assignment.params,
  });

  if (assignment.instrument === 'four_osc') {
    sendNativeAudioCommand('set_track_preset', {
      trackId: track.id,
      presetId: assignment.presetId,
    });
  }
}

export function syncTrackInstruments(tracks: DAWTrack[]): void {
  playableTracks(tracks).forEach(track => {
    syncTrackInstrumentToEngine(track);
    sendNativeAudioCommand('set_record_arm', {
      trackId: track.id,
      armed: track.isRecordArmed,
    });
  });
}

export function trackUsesDrumClipPlayback(track: DAWTrack): boolean {
  return usesSampleKitEngine(track.type);
}
