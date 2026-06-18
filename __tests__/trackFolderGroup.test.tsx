jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => '{"ok":true}'),
}));

import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import {
  compileApcSourceToSnapshot,
  decomposeSnapshotToApcSource,
} from '../src/arrangement/apc';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {restoreProjectSnapshot} from '../src/arrangement/projectRestore';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {TrackSidebar} from '../src/web/components/TrackSidebar';

function track(id: string, name: string): DAWTrack {
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

function SidebarHarness() {
  const tracks = useDAWStore(state => state.tracks);
  return (
    <TrackSidebar
      width={260}
      onWidthChange={jest.fn()}
      verticalScrollRef={{current: null}}
      onVerticalScroll={jest.fn()}
      rowHeight={124}
      playheadBeat={0}
      tracks={tracks}
      archivedTracks={[]}
      selectedTrackId={null}
      onMoveTrack={jest.fn()}
      onTrackArchiveChange={jest.fn()}
      onTrackDisableChange={jest.fn()}
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
    />
  );
}

describe('track folder and group metadata', () => {
  beforeEach(resetStore);

  it('normalizes folder and group labels with undo history', () => {
    useDAWStore.getState().setTrackFolderName('track-a', '  Verse   Stack  ');
    useDAWStore.getState().setTrackGroupName('track-a', '  Keys   Layer  ');

    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-a')).toMatchObject({
      trackFolderName: 'Verse Stack',
      trackGroupName: 'Keys Layer',
    });

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-a')?.trackGroupName)
      .toBeUndefined();
    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-a')?.trackFolderName)
      .toBeUndefined();
  });

  it('persists folder and group labels through the .apc source round-trip', () => {
    useDAWStore.getState().setTrackFolderName('track-b', 'Hook');
    useDAWStore.getState().setTrackGroupName('track-b', 'Lead Stack');
    const compiled = compileApcSourceToSnapshot(
      decomposeSnapshotToApcSource(captureProjectSnapshot(), '2026-06-03T12:00:00.000Z'),
    );
    if (!compiled.ok) {
      throw new Error(compiled.errors.map(error => error.message).join('; '));
    }

    resetStore();
    restoreProjectSnapshot(compiled.snapshot, {skipNativeRefresh: true});

    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-b')).toMatchObject({
      trackFolderName: 'Hook',
      trackGroupName: 'Lead Stack',
    });
  });

  it('lets the sidebar set folder and group labels', () => {
    render(<SidebarHarness />);

    fireEvent.click(screen.getByRole('button', {name: 'Show track details for Alpha'}));
    fireEvent.change(screen.getByRole('textbox', {name: 'Folder for Alpha'}), {
      target: {value: 'Verse'},
    });
    fireEvent.blur(screen.getByRole('textbox', {name: 'Folder for Alpha'}));
    fireEvent.change(screen.getByRole('textbox', {name: 'Group for Alpha'}), {
      target: {value: 'Keys'},
    });
    fireEvent.keyDown(screen.getByRole('textbox', {name: 'Group for Alpha'}), {key: 'Enter'});

    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-a')).toMatchObject({
      trackFolderName: 'Verse',
      trackGroupName: 'Keys',
    });
  });
});
