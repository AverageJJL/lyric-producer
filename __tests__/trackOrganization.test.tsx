jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => '{"ok":true}'),
}));

import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import {compileApcSourceToSnapshot, decomposeSnapshotToApcSource} from '../src/arrangement/apc';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {restoreProjectSnapshot} from '../src/arrangement/projectRestore';
import {buildNativeTracksPayload} from '../src/native/trackPayload';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {TrackSidebar} from '../src/web/components/TrackSidebar';

const TS = '2026-06-03T12:00:00.000Z';

function roundTripCurrentSnapshot(): void {
  const compiled = compileApcSourceToSnapshot(
    decomposeSnapshotToApcSource(captureProjectSnapshot(), TS),
  );
  if (!compiled.ok) {
    throw new Error(compiled.errors.map(error => error.message).join('; '));
  }
  resetStore();
  restoreProjectSnapshot(compiled.snapshot, {skipNativeRefresh: true});
}

function track(id: string, name: string, options?: {archived?: boolean; disabled?: boolean}): DAWTrack {
  return {
    id,
    name,
    isMuted: false,
    isSolo: false,
    type: 'software_instrument',
    instrumentId: 'synth_lead',
    presetId: 'pop_lead',
    isRecordArmed: false,
    isLocked: false,
    isArchived: options?.archived || undefined,
    isDisabled: options?.disabled || undefined,
  };
}

function block(trackId: string): DAWBlock {
  return {
    id: `clip-${trackId}`,
    trackId,
    name: 'Clip',
    startBeat: 0,
    lengthBeats: 4,
    type: 'midi',
    color: '#4a7fd4',
    notes: [],
  };
}

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [track('track-a', 'Alpha'), track('track-b', 'Beta')],
    patterns: {},
    blocks: [block('track-a'), block('track-b')],
    masterVolumeDb: 0,
    masterPan: 0,
    snapGrid: DEFAULT_SNAP_GRID,
    isRelativeSnapEnabled: false,
    performanceMode: 'linear',
    looperLengthBars: 4,
    isCycleEnabled: false,
    cycleStartBeat: 0,
    cycleEndBeat: 4,
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    isRecording: false,
    recordingBlockId: null,
    recordingStartSeconds: null,
    recordingWallClockStart: null,
    recordingError: null,
    playheadBeat: 0,
    playheadSeconds: 0,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    playStartSeconds: 0,
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    midiAudition: null,
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

describe('track organization', () => {
  beforeEach(resetStore);

  it('reorders active tracks and records undo history', () => {
    useDAWStore.getState().moveTrack('track-b', -1);
    expect(useDAWStore.getState().tracks.map(item => item.id)).toEqual(['track-b', 'track-a']);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks.map(item => item.id)).toEqual(['track-a', 'track-b']);
  });

  it('archives tracks without deleting clips and excludes them from native payloads', () => {
    useDAWStore.setState({
      selectedTrackId: 'track-b',
      selectedBlockId: 'clip-track-b',
      selectedBlockIds: ['clip-track-b'],
    });

    useDAWStore.getState().setTrackArchived('track-b', true);
    const state = useDAWStore.getState();

    expect(state.tracks.find(item => item.id === 'track-b')?.isArchived).toBe(true);
    expect(state.blocks.find(item => item.trackId === 'track-b')).toBeTruthy();
    expect(state.selectedTrackId).toBe('track-a');
    expect(state.selectedBlockId).toBeNull();
    expect(buildNativeTracksPayload(state.tracks).map(item => item.id)).toEqual(['track-a']);
  });

  it('disables tracks without hiding or deleting clips and excludes them from native payloads', () => {
    useDAWStore.setState({
      tracks: [
        track('track-a', 'Alpha'),
        {...track('track-b', 'Beta'), isRecordArmed: true, isInputMonitoringEnabled: true},
      ],
      selectedTrackId: 'track-b',
    });

    useDAWStore.getState().setTrackDisabled('track-b', true);
    const state = useDAWStore.getState();

    expect(state.tracks.map(item => item.id)).toEqual(['track-a', 'track-b']);
    expect(state.tracks.find(item => item.id === 'track-b')).toMatchObject({
      isDisabled: true,
      isRecordArmed: false,
      isInputMonitoringEnabled: false,
    });
    expect(state.blocks.find(item => item.trackId === 'track-b')).toBeTruthy();
    expect(state.selectedTrackId).toBe('track-b');
    expect(buildNativeTracksPayload(state.tracks).map(item => item.id)).toEqual(['track-a']);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-b')?.isDisabled)
      .toBeUndefined();
  });

  it('stores per-track height scale with undo history', () => {
    useDAWStore.getState().setTrackHeightScale('track-b', 1.25);
    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-b')?.trackHeightScale)
      .toBe(1.25);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-b')?.trackHeightScale)
      .toBeUndefined();
  });

  it('persists archived tracks through the .apc source round-trip', () => {
    useDAWStore.getState().setTrackArchived('track-b', true);
    roundTripCurrentSnapshot();

    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-b')?.isArchived)
      .toBe(true);
    expect(useDAWStore.getState().blocks.find(item => item.trackId === 'track-b')).toBeTruthy();
  });

  it('persists disabled tracks through the .apc source round-trip', () => {
    useDAWStore.getState().setTrackDisabled('track-b', true);
    roundTripCurrentSnapshot();

    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-b')?.isDisabled)
      .toBe(true);
  });

  it('persists per-track height scale through the .apc source round-trip', () => {
    useDAWStore.getState().setTrackHeightScale('track-b', 1.5);
    roundTripCurrentSnapshot();

    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-b')?.trackHeightScale)
      .toBe(1.5);
  });

  it('renders move/archive and restore controls in the sidebar', () => {
    const onMoveTrack = jest.fn();
    const onTrackArchiveChange = jest.fn();
    const onTrackDisableChange = jest.fn();
    render(
      <TrackSidebar
        width={260}
        onWidthChange={jest.fn()}
        verticalScrollRef={{current: null}}
        onVerticalScroll={jest.fn()}
        rowHeight={96}
        playheadBeat={0}
        tracks={[track('track-a', 'Alpha'), track('track-b', 'Beta')]}
        archivedTracks={[track('track-c', 'Gamma', {archived: true})]}
        selectedTrackId={null}
        onMoveTrack={onMoveTrack}
        onTrackArchiveChange={onTrackArchiveChange}
        onTrackDisableChange={onTrackDisableChange}
        onToggleMute={jest.fn()}
        onToggleSolo={jest.fn()}
        onSelectTrack={jest.fn()}
        onToggleRecordArm={jest.fn()}
        onTrackInputMonitoringChange={jest.fn()}
        onTrackAutomationModeChange={jest.fn()}
        onTrackAutomationPointSet={jest.fn()}
        onTrackAutomationPointRemove={jest.fn()}
        onTrackVolumeChange={jest.fn()}
        onTrackPanChange={jest.fn()}
        onTrackGainChange={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Show track details for Beta'}));
    fireEvent.click(screen.getByRole('button', {name: 'Move Beta up'}));
    fireEvent.click(screen.getByRole('button', {name: 'Show track details for Alpha'}));
    fireEvent.click(screen.getByRole('button', {name: 'Disable Alpha'}));
    fireEvent.click(screen.getByRole('button', {name: 'Archive Alpha'}));
    fireEvent.change(screen.getByLabelText('Track height for Alpha'), {
      target: {value: '1.25'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Restore'}));

    expect(onMoveTrack).toHaveBeenCalledWith('track-b', -1);
    expect(onTrackDisableChange).toHaveBeenCalledWith('track-a', true);
    expect(onTrackArchiveChange).toHaveBeenCalledWith('track-a', true);
    expect(onTrackArchiveChange).toHaveBeenCalledWith('track-c', false);
    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-a')?.trackHeightScale)
      .toBe(1.25);
  });
});
