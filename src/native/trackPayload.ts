import {normalizeAutomationMode, type TrackAutomationLane} from '../automation/trackAutomation';
import {normalizeTrackMix} from '../music/trackMix';
import {normalizeTrackOrganizationLabel, playableTracks} from '../music/trackOrganization';
import {
  normalizeTrackRoutingRole,
  normalizeTrackOutputTarget,
  normalizeTrackRoutingSends,
  normalizeTrackSidechainSource,
  type TrackRoutingSend,
} from '../music/trackRouting';
import type {DAWTrack} from '../store/useDAWStore';

export type NativeTrackPayload = {
  id: string;
  name: string;
  isMuted: boolean;
  isSolo: boolean;
  type: DAWTrack['type'];
  instrumentId: string;
  presetId: string;
  isRecordArmed: boolean;
  isInputMonitoringEnabled: boolean;
  isFrozen: boolean;
  trackFolderName: string;
  trackGroupName: string;
  automationMode: string;
  automationLanes: TrackAutomationLane[];
  volumeDb: number;
  pan: number;
  gainDb: number;
  effectiveVolumeDb: number;
  routingRole: string;
  routingOutputTrackId: string;
  routingSends: TrackRoutingSend[];
  routingSidechainSourceTrackId: string;
};

export function buildNativeTrackPayload(track: DAWTrack, tracks: DAWTrack[] = [track]): NativeTrackPayload {
  const mix = normalizeTrackMix(track);

  return {
    id: track.id,
    name: track.name,
    isMuted: track.isMuted,
    isSolo: track.isSolo,
    type: track.type,
    instrumentId: track.instrumentId,
    presetId: track.presetId,
    isRecordArmed: track.isRecordArmed,
    isInputMonitoringEnabled: track.type === 'voice_audio' && track.isInputMonitoringEnabled === true,
    isFrozen: track.isFrozen === true,
    trackFolderName: normalizeTrackOrganizationLabel(track.trackFolderName) ?? '',
    trackGroupName: normalizeTrackOrganizationLabel(track.trackGroupName) ?? '',
    automationMode: normalizeAutomationMode(track.automationMode),
    automationLanes: track.automationLanes ?? [],
    routingRole: normalizeTrackRoutingRole(track.routingRole),
    routingOutputTrackId: normalizeTrackOutputTarget(track, tracks),
    routingSends: normalizeTrackRoutingSends(track, tracks),
    routingSidechainSourceTrackId: normalizeTrackSidechainSource(track, tracks) ?? '',
    ...mix,
  };
}

export function buildNativeTracksPayload(tracks: DAWTrack[]): NativeTrackPayload[] {
  const playable = playableTracks(tracks);
  return playable.map(track => buildNativeTrackPayload(track, playable));
}
