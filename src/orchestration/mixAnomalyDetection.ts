import type {ProjectSnapshot} from '../arrangement/projectSnapshot';
import {FX_SLOT_PLUGINS} from '../music/fxPluginMetadata';
import {instrumentForTrack, type InstrumentCategory} from '../music/instruments';
import {normalizeTrackMix} from '../music/trackMix';
import type {DAWBlock, DAWTrack} from '../store/useDAWStore';
import type {AiFxTarget} from './aiFxControl';

export type MixAnomalyKind =
  | 'low_mid_congestion'
  | 'vocal_masking'
  | 'headroom_transient_spike';

export type MixAnomaly = {
  kind: MixAnomalyKind;
  trackId: string;
  relatedTrackId?: string;
  clipIds: string[];
  severity: 'medium' | 'high';
  reason: string;
};

export type MixAnomalyDetectionResult = {
  anomalies: MixAnomaly[];
  fxTargets: AiFxTarget[];
};

export type MixAnomalySnapshot = Pick<ProjectSnapshot, 'tracks' | 'blocks'>;

type TrackContext = {
  track: DAWTrack;
  category: InstrumentCategory;
  blocks: DAWBlock[];
};

const OVERLAP_THRESHOLD_BEATS = 0.25;
const HIGH_SOURCE_PEAK = 0.95;
const RAISED_SOURCE_PEAK = 0.9;
const RAISED_EFFECTIVE_DB = 3;

function isAudible(track: DAWTrack, hasSolo: boolean): boolean {
  if (track.isMuted) {
    return false;
  }
  return hasSolo ? track.isSolo : true;
}

function isActiveBlock(block: DAWBlock): boolean {
  return block.lengthBeats > 0 && block.isMuted !== true && block.isMissingMedia !== true;
}

function blockOverlap(left: DAWBlock, right: DAWBlock): number {
  const start = Math.max(left.startBeat, right.startBeat);
  const end = Math.min(
    left.startBeat + left.lengthBeats,
    right.startBeat + right.lengthBeats,
  );
  return Math.max(0, end - start);
}

function overlappingClipIds(left: TrackContext, right: TrackContext): string[] {
  const ids = new Set<string>();
  for (const leftBlock of left.blocks) {
    for (const rightBlock of right.blocks) {
      if (blockOverlap(leftBlock, rightBlock) >= OVERLAP_THRESHOLD_BEATS) {
        ids.add(leftBlock.id);
        ids.add(rightBlock.id);
      }
    }
  }
  return [...ids];
}

function contexts(snapshot: MixAnomalySnapshot): TrackContext[] {
  const hasSolo = snapshot.tracks.some(track => track.isSolo);
  return snapshot.tracks
    .filter(track => isAudible(track, hasSolo))
    .map(track => ({
      track,
      category: instrumentForTrack(track.type, track.instrumentId).category,
      blocks: snapshot.blocks.filter(block => block.trackId === track.id && isActiveBlock(block)),
    }))
    .filter(context => context.blocks.length > 0);
}

function canTargetTrack(context: TrackContext, clipIds: string[]): boolean {
  if (context.track.isLocked) {
    return false;
  }
  return context.blocks
    .filter(block => clipIds.includes(block.id))
    .every(block => block.isLocked !== true);
}

function lowMidRank(context: TrackContext): number | null {
  if (context.category === 'Bass') {
    return 0;
  }
  if (context.category === 'Keys') {
    return 1;
  }
  if (context.category === 'Guitar') {
    return 2;
  }
  if (context.category === 'Pad') {
    return 3;
  }
  return null;
}

function secondaryLowMidTrack(left: TrackContext, right: TrackContext): TrackContext {
  const leftRank = lowMidRank(left) ?? 99;
  const rightRank = lowMidRank(right) ?? 99;
  return leftRank > rightRank ? left : right;
}

function eqCutTarget(trackId: string, reason: string): AiFxTarget {
  return {
    trackId,
    slot: 'eq',
    pluginId: FX_SLOT_PLUGINS.eq.pluginId,
    enabled: true,
    values: {lmFreq: 0.42, lowMid: 0.36, lmReso: 0.45, dryWet: 1},
    reasoning: reason,
  };
}

function compressorTarget(trackId: string, reason: string): AiFxTarget {
  return {
    trackId,
    slot: 'compressor',
    pluginId: FX_SLOT_PLUGINS.compressor.pluginId,
    enabled: true,
    values: {threshold: 0.38, ratio: 0.42, speed: 0.28, makeupGain: 0.5, dryWet: 1},
    reasoning: reason,
  };
}

function transientTarget(trackId: string, reason: string): AiFxTarget {
  return {
    trackId,
    slot: 'compressor',
    pluginId: FX_SLOT_PLUGINS.compressor.pluginId,
    enabled: true,
    values: {threshold: 0.32, ratio: 0.5, speed: 0.22, makeupGain: 0.45, dryWet: 1},
    reasoning: reason,
  };
}

function addTarget(targets: Map<string, AiFxTarget>, target: AiFxTarget): void {
  targets.set(`${target.trackId}:${target.slot}`, target);
}

function detectLowMidCongestion(
  trackContexts: TrackContext[],
  anomalies: MixAnomaly[],
  targets: Map<string, AiFxTarget>,
): void {
  const lowMidTracks = trackContexts.filter(context => lowMidRank(context) !== null);
  for (let index = 0; index < lowMidTracks.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < lowMidTracks.length; nextIndex += 1) {
      const left = lowMidTracks[index];
      const right = lowMidTracks[nextIndex];
      const clipIds = overlappingClipIds(left, right);
      if (clipIds.length === 0) {
        continue;
      }
      const targetTrack = secondaryLowMidTrack(left, right);
      const reason = 'Overlapping low-mid instruments can crowd 250-500 Hz.';
      anomalies.push({
        kind: 'low_mid_congestion',
        trackId: targetTrack.track.id,
        relatedTrackId: targetTrack === left ? right.track.id : left.track.id,
        clipIds,
        severity: clipIds.length > 2 ? 'high' : 'medium',
        reason,
      });
      if (canTargetTrack(targetTrack, clipIds)) {
        addTarget(targets, eqCutTarget(targetTrack.track.id, reason));
      }
    }
  }
}

function detectVocalMasking(
  trackContexts: TrackContext[],
  anomalies: MixAnomaly[],
  targets: Map<string, AiFxTarget>,
): void {
  const vocals = trackContexts.filter(context => context.track.type === 'voice_audio');
  const instruments = trackContexts.filter(context =>
    context.track.type === 'software_instrument' && context.category !== 'Bass',
  );
  for (const vocal of vocals) {
    for (const instrument of instruments) {
      const clipIds = overlappingClipIds(vocal, instrument);
      if (clipIds.length === 0) {
        continue;
      }
      const reason = 'Instrument phrases overlap the vocal lane; use light ducking-style compression.';
      anomalies.push({
        kind: 'vocal_masking',
        trackId: instrument.track.id,
        relatedTrackId: vocal.track.id,
        clipIds,
        severity: clipIds.length > 2 ? 'high' : 'medium',
        reason,
      });
      if (canTargetTrack(instrument, clipIds)) {
        addTarget(targets, compressorTarget(instrument.track.id, reason));
      }
    }
  }
}

function hasTransientRisk(context: TrackContext): boolean {
  const mix = normalizeTrackMix(context.track);
  return context.blocks.some(block => {
    const peak = block.sourcePeakAmplitude;
    const clipGain = typeof block.clipGainDb === 'number' ? block.clipGainDb : 0;
    return (
      (typeof peak === 'number' && peak >= HIGH_SOURCE_PEAK) ||
      (typeof peak === 'number' && peak >= RAISED_SOURCE_PEAK &&
        mix.effectiveVolumeDb + clipGain >= RAISED_EFFECTIVE_DB) ||
      (context.track.type === 'drum_machine' && mix.effectiveVolumeDb >= RAISED_EFFECTIVE_DB)
    );
  });
}

function detectTransientSpikes(
  trackContexts: TrackContext[],
  anomalies: MixAnomaly[],
  targets: Map<string, AiFxTarget>,
): void {
  for (const context of trackContexts) {
    if (!hasTransientRisk(context)) {
      continue;
    }
    const clipIds = context.blocks.map(block => block.id);
    const reason = 'Native-derived peak and mix metadata indicate possible headroom spikes.';
    anomalies.push({
      kind: 'headroom_transient_spike',
      trackId: context.track.id,
      clipIds,
      severity: 'high',
      reason,
    });
    if (canTargetTrack(context, clipIds)) {
      addTarget(targets, transientTarget(context.track.id, reason));
    }
  }
}

export function detectMixAnomalies(snapshot: MixAnomalySnapshot): MixAnomalyDetectionResult {
  const trackContexts = contexts(snapshot);
  const anomalies: MixAnomaly[] = [];
  const targets = new Map<string, AiFxTarget>();

  detectLowMidCongestion(trackContexts, anomalies, targets);
  detectVocalMasking(trackContexts, anomalies, targets);
  detectTransientSpikes(trackContexts, anomalies, targets);

  return {anomalies, fxTargets: [...targets.values()]};
}
