import type {DrumPattern} from '../music/drumPatterns';
import {normalizeTrackOrganizationLabel} from '../music/trackOrganization';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import {useDAWStore, type DAWBlock, type DAWStore, type DAWTrack} from '../store/useDAWStore';

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function recordHistory(state: DAWStore): void {
  recordArrangementHistory(captureArrangementHistorySnapshot(state));
}

export function blockFromSnapshot(block: DAWBlock): DAWBlock {
  return {
    ...block,
    isLocked: block.isLocked === true,
    notes: block.notes ? block.notes.map(note => ({...note})) : undefined,
    waveformPeaks: block.waveformPeaks ? [...block.waveformPeaks] : undefined,
  };
}

export function trackFromSnapshot(track: DAWTrack): DAWTrack {
  return {
    ...track,
    isLocked: track.isLocked === true,
    isFrozen: track.isFrozen === true,
    trackFolderName: normalizeTrackOrganizationLabel(track.trackFolderName),
    trackGroupName: normalizeTrackOrganizationLabel(track.trackGroupName),
    samplerRegions: track.samplerRegions?.map(region => ({...region})),
  };
}

export function restoreTrackWithHistory(track: DAWTrack): boolean {
  const state = useDAWStore.getState();
  const restored = trackFromSnapshot(track);
  const tracks = [
    ...state.tracks.filter(item => item.id !== restored.id),
    restored,
  ];
  if (jsonEqual(state.tracks, tracks)) {
    return false;
  }

  recordHistory(state);
  useDAWStore.setState({tracks, syncSource: 'ui'});
  return true;
}

export function upsertBlockWithHistory(block: DAWBlock): boolean {
  const state = useDAWStore.getState();
  const blocks = [
    ...state.blocks.filter(item => item.id !== block.id),
    block,
  ];
  if (jsonEqual(state.blocks, blocks)) {
    return false;
  }

  recordHistory(state);
  useDAWStore.setState({blocks, syncSource: 'ui'});
  return true;
}

export function upsertDrumPatternWithHistory(pattern: DrumPattern): boolean {
  const state = useDAWStore.getState();
  const patterns = {...state.patterns, [pattern.id]: pattern};
  if (jsonEqual(state.patterns, patterns)) {
    return false;
  }

  recordHistory(state);
  useDAWStore.setState({patterns, syncSource: 'ui'});
  return true;
}
