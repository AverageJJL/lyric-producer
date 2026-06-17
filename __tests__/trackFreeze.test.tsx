jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => '{"ok":true}'),
}));

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import {applyArrangementOperations} from '../src/arrangement/operations';
import {createProjectDocument, openProjectDocument} from '../src/arrangement/projectDocument';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {TrackSidebar} from '../src/web/components/TrackSidebar';

function track(id: string, name: string, type: DAWTrack['type'] = 'software_instrument'): DAWTrack {
  return {
    id,
    name,
    isMuted: false,
    isSolo: false,
    type,
    instrumentId: type === 'voice_audio' ? 'voice_audio' : 'synth_lead',
    presetId: type === 'voice_audio' ? 'voice_clean' : 'pop_lead',
    isRecordArmed: false,
    isInputMonitoringEnabled: false,
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
    notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
  };
}

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [
      {...track('track-a', 'Alpha', 'voice_audio'), isRecordArmed: true, isInputMonitoringEnabled: true},
      track('track-b', 'Beta'),
    ],
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
      onToggleRecordArm={useDAWStore.getState().toggleTrackRecordArm}
      onTrackInputMonitoringChange={useDAWStore.getState().setTrackInputMonitoring}
      onTrackAutomationModeChange={jest.fn()}
      onTrackAutomationPointSet={jest.fn()}
      onTrackAutomationPointRemove={jest.fn()}
      onTrackVolumeChange={jest.fn()}
      onTrackPanChange={jest.fn()}
      onTrackGainChange={jest.fn()}
    />
  );
}

describe('track freeze foundation', () => {
  beforeEach(resetStore);

  it('freezes tracks with undo and clears live recording policies', () => {
    useDAWStore.getState().setTrackFrozen('track-a', true);

    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-a')).toMatchObject({
      isFrozen: true,
      isRecordArmed: false,
      isInputMonitoringEnabled: false,
    });

    useDAWStore.getState().toggleTrackRecordArm('track-a');
    useDAWStore.getState().setTrackInputMonitoring('track-a', true);
    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-a')).toMatchObject({
      isRecordArmed: false,
      isInputMonitoringEnabled: false,
    });

    useDAWStore.getState().undo();
    const restored = useDAWStore.getState().tracks.find(item => item.id === 'track-a');
    expect(restored?.isFrozen).not.toBe(true);
    expect(restored).toMatchObject({
      isRecordArmed: true,
      isInputMonitoringEnabled: true,
    });
  });

  it('persists freeze state through project documents', () => {
    useDAWStore.getState().setTrackFrozen('track-b', true);
    const document = createProjectDocument(captureProjectSnapshot(), '2026-06-03T12:00:00.000Z');

    resetStore();
    openProjectDocument(document, {skipNativeRefresh: true});

    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-b')?.isFrozen).toBe(true);
  });

  it('lets the sidebar freeze and unfreeze a track', () => {
    render(<SidebarHarness />);

    fireEvent.click(screen.getByRole('button', {name: 'Show track details for Alpha'}));
    fireEvent.click(screen.getByRole('button', {name: 'Freeze Alpha'}));
    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-a')?.isFrozen).toBe(true);

    fireEvent.click(screen.getByRole('button', {name: 'Unfreeze Alpha'}));
    expect(useDAWStore.getState().tracks.find(item => item.id === 'track-a')?.isFrozen)
      .not.toBe(true);
  });

  it('skips scripted clip edits on frozen tracks', () => {
    useDAWStore.getState().setTrackFrozen('track-b', true);

    applyArrangementOperations(
      [{op: 'moveClip', clipId: 'clip-track-b', startBeat: 8, trackId: 'track-b'}],
      {skipNativeRefresh: true},
    );

    expect(useDAWStore.getState().blocks.find(item => item.id === 'clip-track-b')).toMatchObject({
      startBeat: 0,
      trackId: 'track-b',
    });
  });
});
