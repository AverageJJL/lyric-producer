import type {DAWBlock, DAWTrack} from '../store/useDAWStore';

export type TrackMoveDirection = -1 | 1;

export const MAX_TRACK_ORGANIZATION_LABEL_LENGTH = 32;
export const DEFAULT_TRACK_HEIGHT_SCALE = 1;
export const TRACK_HEIGHT_SCALE_OPTIONS = [1, 1.25, 1.5, 1.75, 2] as const;

export function normalizeTrackOrganizationLabel(value: string | null | undefined): string | undefined {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  return normalized.length > 0
    ? normalized.slice(0, MAX_TRACK_ORGANIZATION_LABEL_LENGTH)
    : undefined;
}

export function normalizeTrackHeightScale(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TRACK_HEIGHT_SCALE;
  }

  return TRACK_HEIGHT_SCALE_OPTIONS.reduce((closest, option) =>
    Math.abs(option - value) < Math.abs(closest - value) ? option : closest,
  DEFAULT_TRACK_HEIGHT_SCALE);
}

export function storedTrackHeightScale(value: number | null | undefined): number | undefined {
  const normalized = normalizeTrackHeightScale(value);
  return normalized === DEFAULT_TRACK_HEIGHT_SCALE ? undefined : normalized;
}

export function trackHeightScaleLabel(value: number | null | undefined): string {
  return `${Math.round(normalizeTrackHeightScale(value) * 100)}%`;
}

export function isTrackArchived(track: Pick<DAWTrack, 'isArchived'>): boolean {
  return track.isArchived === true;
}

export function isTrackDisabled(track: Pick<DAWTrack, 'isDisabled'>): boolean {
  return track.isDisabled === true;
}

export function isTrackFrozen(track: Pick<DAWTrack, 'isFrozen'>): boolean {
  return track.isFrozen === true;
}

export function activeTracks(tracks: DAWTrack[]): DAWTrack[] {
  return tracks.filter(track => !isTrackArchived(track));
}

export function playableTracks(tracks: DAWTrack[]): DAWTrack[] {
  return activeTracks(tracks).filter(track => !isTrackDisabled(track));
}

export function archivedTracks(tracks: DAWTrack[]): DAWTrack[] {
  return tracks.filter(isTrackArchived);
}

export function activeTrackIds(tracks: DAWTrack[]): Set<string> {
  return new Set(activeTracks(tracks).map(track => track.id));
}

export function playableTrackIds(tracks: DAWTrack[]): Set<string> {
  return new Set(playableTracks(tracks).map(track => track.id));
}

export function blocksForTrackIds(blocks: DAWBlock[], trackIds: Set<string>): DAWBlock[] {
  return blocks.filter(block => trackIds.has(block.trackId));
}

export function blocksForActiveTracks(blocks: DAWBlock[], tracks: DAWTrack[]): DAWBlock[] {
  return blocksForTrackIds(blocks, activeTrackIds(tracks));
}

export function trackIsVisible(tracks: DAWTrack[], trackId: string): boolean {
  const track = tracks.find(item => item.id === trackId);
  return track ? !isTrackArchived(track) : true;
}

export function trackIsPlayable(tracks: DAWTrack[], trackId: string): boolean {
  const track = tracks.find(item => item.id === trackId);
  return track ? !isTrackArchived(track) && !isTrackDisabled(track) : true;
}

export function moveActiveTrack(
  tracks: DAWTrack[],
  trackId: string,
  direction: TrackMoveDirection,
): DAWTrack[] {
  const active = activeTracks(tracks);
  const archived = archivedTracks(tracks);
  const index = active.findIndex(track => track.id === trackId);
  if (index < 0) {
    return tracks;
  }

  const nextIndex = Math.max(0, Math.min(active.length - 1, index + direction));
  if (nextIndex === index) {
    return tracks;
  }

  const reordered = [...active];
  const [track] = reordered.splice(index, 1);
  reordered.splice(nextIndex, 0, track!);
  return [...reordered, ...archived];
}

export function trackWithArchiveState(track: DAWTrack, isArchived: boolean): DAWTrack {
  if (!isArchived) {
    const next = {...track, isRecordArmed: false};
    delete next.isArchived;
    return next;
  }
  return {...track, isArchived: true, isRecordArmed: false};
}

export function setTrackArchiveState(
  tracks: DAWTrack[],
  trackId: string,
  isArchived: boolean,
): DAWTrack[] {
  const target = tracks.find(track => track.id === trackId);
  if (!target || isTrackArchived(target) === isArchived) {
    return tracks;
  }

  const updated = tracks.map(track =>
    track.id === trackId ? trackWithArchiveState(track, isArchived) : track,
  );
  return [...activeTracks(updated), ...archivedTracks(updated)];
}

export function trackWithDisabledState(track: DAWTrack, isDisabled: boolean): DAWTrack {
  if (!isDisabled) {
    const next = {...track, isRecordArmed: false};
    delete next.isDisabled;
    return next;
  }

  return {
    ...track,
    isDisabled: true,
    isRecordArmed: false,
    isInputMonitoringEnabled: false,
  };
}

export function setTrackDisabledState(
  tracks: DAWTrack[],
  trackId: string,
  isDisabled: boolean,
): DAWTrack[] {
  const target = tracks.find(track => track.id === trackId);
  if (!target || isTrackDisabled(target) === isDisabled) {
    return tracks;
  }

  return tracks.map(track =>
    track.id === trackId ? trackWithDisabledState(track, isDisabled) : track,
  );
}

export function trackWithFrozenState(track: DAWTrack, isFrozen: boolean): DAWTrack {
  if (!isFrozen) {
    const next = {...track};
    delete next.isFrozen;
    return next;
  }

  return {
    ...track,
    isFrozen: true,
    isRecordArmed: false,
    isInputMonitoringEnabled: false,
  };
}

export function setTrackFrozenState(
  tracks: DAWTrack[],
  trackId: string,
  isFrozen: boolean,
): DAWTrack[] {
  const target = tracks.find(track => track.id === trackId);
  if (!target || isTrackFrozen(target) === isFrozen) {
    return tracks;
  }

  return tracks.map(track =>
    track.id === trackId ? trackWithFrozenState(track, isFrozen) : track,
  );
}

export function trackWithHeightScale(track: DAWTrack, value: number | null | undefined): DAWTrack {
  const normalized = storedTrackHeightScale(value);
  if (normalized === undefined) {
    const next = {...track};
    delete next.trackHeightScale;
    return next;
  }
  return {...track, trackHeightScale: normalized};
}

export function setTrackHeightScaleState(
  tracks: DAWTrack[],
  trackId: string,
  value: number | null | undefined,
): DAWTrack[] {
  const target = tracks.find(track => track.id === trackId);
  const normalized = storedTrackHeightScale(value);
  if (!target || storedTrackHeightScale(target.trackHeightScale) === normalized) {
    return tracks;
  }

  return tracks.map(track =>
    track.id === trackId ? trackWithHeightScale(track, value) : track,
  );
}
