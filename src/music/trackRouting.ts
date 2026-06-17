import type {DAWTrack} from '../store/useDAWStore';

export const MASTER_OUTPUT_ID = 'master';
export const MIN_SEND_GAIN_DB = -60;
export const MAX_SEND_GAIN_DB = 6;
export const DEFAULT_TRACK_ROUTING_ROLE = 'track';

export const TRACK_ROUTING_ROLES = ['track', 'bus', 'aux_return'] as const;
export type TrackRoutingRole = typeof TRACK_ROUTING_ROLES[number];

export type TrackRoutingSend = {
  targetTrackId: string;
  gainDb: number;
  preFader?: boolean;
};

export type TrackRoutingIssue = {
  trackId: string;
  type:
    | 'invalid-role'
    | 'missing-output'
    | 'self-output'
    | 'output-cycle'
    | 'missing-send'
    | 'self-send'
    | 'missing-sidechain'
    | 'self-sidechain';
  targetTrackId?: string;
  routingRole?: string;
};

function finiteOrFallback(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function rawOutputTarget(track: DAWTrack): string {
  const target = track.routingOutputTrackId?.trim();
  return target && target.length > 0 ? target : MASTER_OUTPUT_ID;
}

function tracksById(tracks: DAWTrack[]): Map<string, DAWTrack> {
  return new Map(tracks.map(track => [track.id, track]));
}

function isTrackRoutingRole(value: string): value is TrackRoutingRole {
  return TRACK_ROUTING_ROLES.includes(value as TrackRoutingRole);
}

function outputCreatesCycle(track: DAWTrack, tracks: DAWTrack[], targetTrackId: string): boolean {
  const byId = tracksById(tracks);
  const seen = new Set<string>([track.id]);
  let cursor = targetTrackId;

  while (cursor !== MASTER_OUTPUT_ID) {
    if (seen.has(cursor)) {
      return true;
    }
    seen.add(cursor);
    const next = byId.get(cursor);
    if (!next) {
      return false;
    }
    cursor = rawOutputTarget(next);
  }

  return false;
}

export function clampRoutingSendGainDb(value: number): number {
  return Math.min(MAX_SEND_GAIN_DB, Math.max(MIN_SEND_GAIN_DB, finiteOrFallback(value, 0)));
}

export function normalizeTrackRoutingRole(role: string | undefined): TrackRoutingRole {
  const normalized = role?.trim();
  return normalized && isTrackRoutingRole(normalized) ? normalized : DEFAULT_TRACK_ROUTING_ROLE;
}

export function storedTrackRoutingRole(role: string | undefined): TrackRoutingRole | undefined {
  const normalized = normalizeTrackRoutingRole(role);
  return normalized === DEFAULT_TRACK_ROUTING_ROLE ? undefined : normalized;
}

export function normalizeTrackOutputTarget(track: DAWTrack, tracks: DAWTrack[]): string {
  const target = rawOutputTarget(track);
  if (target === MASTER_OUTPUT_ID || target === track.id) {
    return MASTER_OUTPUT_ID;
  }
  if (!tracks.some(item => item.id === target)) {
    return MASTER_OUTPUT_ID;
  }
  return outputCreatesCycle(track, tracks, target) ? MASTER_OUTPUT_ID : target;
}

export function normalizeTrackRoutingSends(track: DAWTrack, tracks: DAWTrack[]): TrackRoutingSend[] {
  const trackIds = new Set(tracks.map(item => item.id));
  const sends = new Map<string, TrackRoutingSend>();

  for (const send of track.routingSends ?? []) {
    const targetTrackId = send.targetTrackId.trim();
    if (!targetTrackId || targetTrackId === track.id || !trackIds.has(targetTrackId)) {
      continue;
    }

    const normalized: TrackRoutingSend = {
      targetTrackId,
      gainDb: clampRoutingSendGainDb(send.gainDb),
    };
    if (send.preFader === true) {
      normalized.preFader = true;
    }
    sends.set(targetTrackId, normalized);
  }

  return [...sends.values()];
}

export function normalizeTrackSidechainSource(track: DAWTrack, tracks: DAWTrack[]): string | undefined {
  const sourceTrackId = track.routingSidechainSourceTrackId?.trim();
  if (
    !sourceTrackId ||
    sourceTrackId === track.id ||
    !tracks.some(item => item.id === sourceTrackId)
  ) {
    return undefined;
  }

  return sourceTrackId;
}

export function validateTrackRouting(tracks: DAWTrack[]): TrackRoutingIssue[] {
  const issues: TrackRoutingIssue[] = [];
  const trackIds = new Set(tracks.map(track => track.id));

  for (const track of tracks) {
    const routingRole = track.routingRole?.trim();
    if (routingRole && !isTrackRoutingRole(routingRole)) {
      issues.push({trackId: track.id, type: 'invalid-role', routingRole});
    }

    const outputTarget = rawOutputTarget(track);
    if (outputTarget !== MASTER_OUTPUT_ID) {
      if (outputTarget === track.id) {
        issues.push({trackId: track.id, type: 'self-output', targetTrackId: outputTarget});
      } else if (!trackIds.has(outputTarget)) {
        issues.push({trackId: track.id, type: 'missing-output', targetTrackId: outputTarget});
      } else if (outputCreatesCycle(track, tracks, outputTarget)) {
        issues.push({trackId: track.id, type: 'output-cycle', targetTrackId: outputTarget});
      }
    }

    for (const send of track.routingSends ?? []) {
      const targetTrackId = send.targetTrackId.trim();
      if (targetTrackId === track.id) {
        issues.push({trackId: track.id, type: 'self-send', targetTrackId});
      } else if (!targetTrackId || !trackIds.has(targetTrackId)) {
        issues.push({trackId: track.id, type: 'missing-send', targetTrackId});
      }
    }

    const sidechainSource = track.routingSidechainSourceTrackId?.trim();
    if (sidechainSource) {
      if (sidechainSource === track.id) {
        issues.push({trackId: track.id, type: 'self-sidechain', targetTrackId: sidechainSource});
      } else if (!trackIds.has(sidechainSource)) {
        issues.push({trackId: track.id, type: 'missing-sidechain', targetTrackId: sidechainSource});
      }
    }
  }

  return issues;
}

export function removeTrackRoutingTarget(tracks: DAWTrack[], targetTrackId: string): DAWTrack[] {
  return tracks.map(track => {
    const next = {...track};
    if (next.routingOutputTrackId === targetTrackId) {
      delete next.routingOutputTrackId;
    }
    if (next.routingSidechainSourceTrackId === targetTrackId) {
      delete next.routingSidechainSourceTrackId;
    }
    const sends = (next.routingSends ?? []).filter(send => send.targetTrackId !== targetTrackId);
    if (sends.length > 0) {
      next.routingSends = sends.map(send => ({...send}));
    } else {
      delete next.routingSends;
    }
    return next;
  });
}
