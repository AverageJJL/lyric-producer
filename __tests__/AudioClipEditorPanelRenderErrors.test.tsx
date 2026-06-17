import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import type {useRecordingLaunch} from '../src/hooks/useRecordingLaunch';
import {ClipEditorDock} from '../src/web/components/ClipEditorDock';
import {TrackSidebarRow} from '../src/web/components/TrackSidebarRow';

type RecordingLaunch = ReturnType<typeof useRecordingLaunch>;

const mockSendNativeAudioCommand = jest.fn();

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: (command: string, payload: unknown) =>
    mockSendNativeAudioCommand(command, payload),
}));

const track: DAWTrack = {
  id: 'track-audio',
  name: 'Voice',
  isMuted: false,
  isSolo: false,
  type: 'voice_audio',
  instrumentId: 'voice_audio',
  presetId: 'voice_audio',
  isRecordArmed: false,
  isLocked: false,
};

const block: DAWBlock = {
  id: 'clip-audio',
  trackId: track.id,
  name: 'Lead Vocal',
  startBeat: 8,
  lengthBeats: 4,
  type: 'audio',
  color: '#c45c26',
  sourceLengthBeats: 8,
  sourceOffsetBeats: 1,
  audioFilePath: 'imports/vocal.wav',
  absoluteAudioFilePath: '/tmp/imports/vocal.wav',
};

function recordingLaunch(): RecordingLaunch {
  return {
    canPunchRecord: false,
    canLoopRecord: false,
    isLeadInPending: false,
    leadInLabel: undefined,
    pendingActionLabel: 'Cancel Count-in',
    recordingCountInBeats: 0,
    recordingPreRollBeats: 0,
    isPunchRecordingEnabled: false,
    isLoopRecordingEnabled: false,
    recordingLatencyCompensationMs: -1,
    setRecordingCountInBeats: jest.fn(),
    setRecordingPreRollBeats: jest.fn(),
    setPunchRecordingEnabled: jest.fn(),
    setLoopRecordingEnabled: jest.fn(),
    setRecordingLatencyCompensationMs: jest.fn(),
    handleStartRecording: jest.fn(),
    handleStopRecording: jest.fn(),
    cancelLeadIn: jest.fn(),
  };
}

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    bpm: 120,
    tracks: [track],
    patterns: {},
    blocks: [block],
    selectedBlockId: block.id,
    selectedBlockIds: [block.id],
    selectedTrackId: track.id,
    isRecording: false,
    recordingBlockId: null,
    recordingError: null,
    playheadBeat: 9,
    playheadSeconds: 0,
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    liveAudioPreviewByClip: {},
  });
}

function installRenderBridge(): void {
  window.mediaImport = {
    importAudio: jest.fn(),
    prepareAudioRender: jest.fn(async () => ({
      ok: true as const,
      originalPath: '/tmp/assets/imports/render.wav',
      absolutePath: '/tmp/assets/imports/render.wav',
      relativePath: 'imports/render.wav',
      name: 'render',
    })),
  };
}

describe('AudioClipEditorPanel render errors', () => {
  beforeEach(() => {
    resetStore();
    installRenderBridge();
    mockSendNativeAudioCommand.mockReset();
  });

  afterEach(() => {
    delete window.mediaImport;
  });

  it('shows track row mute as active when the track is muted', () => {
    render(
      <TrackSidebarRow
        track={{...track, isMuted: true}}
        rowHeight={128}
        isSelected={false}
        detailsOpen={false}
        onToggleMute={jest.fn()}
        onToggleSolo={jest.fn()}
        onSelectTrack={jest.fn()}
        onToggleDetails={jest.fn()}
        onToggleRecordArm={jest.fn()}
        onTrackInputMonitoringChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', {name: 'M'})).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an inline render error when the render bridge is unavailable', async () => {
    delete window.mediaImport;
    render(<ClipEditorDock recordingLaunch={recordingLaunch()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'Render In Place'}));
    });

    expect(screen.getByText('Audio render destination API is unavailable.')).toBeInTheDocument();
    expect(useDAWStore.getState().blocks[0]?.id).toBe(block.id);
  });

  it('shows an inline render error when native mixdown fails', async () => {
    mockSendNativeAudioCommand.mockImplementation(command =>
      command === 'render_mixdown_async'
        ? JSON.stringify({ok: false, error: {message: 'A mixdown render is already running.'}})
        : JSON.stringify({ok: true}),
    );
    render(<ClipEditorDock recordingLaunch={recordingLaunch()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'Render In Place'}));
    });

    expect(screen.getByText('A mixdown render is already running.')).toBeInTheDocument();
    expect(useDAWStore.getState().blocks[0]?.id).toBe(block.id);
  });

  it('shows an inline render error when rendered audio analysis is incomplete', async () => {
    mockSendNativeAudioCommand.mockImplementation(command => {
      if (command === 'render_mixdown_async') {
        return JSON.stringify({ok: true, data: {requestId: 'render-1', status: 'running'}});
      }
      if (command === 'get_render_mixdown_status') {
        return JSON.stringify({ok: true, data: {requestId: 'render-1', status: 'completed'}});
      }
      if (command === 'analyze_audio_file') {
        return JSON.stringify({ok: true, data: {}});
      }
      return JSON.stringify({ok: true});
    });
    render(<ClipEditorDock recordingLaunch={recordingLaunch()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'Render In Place'}));
    });

    expect(screen.getByText('Rendered audio could not be analyzed.')).toBeInTheDocument();
    expect(useDAWStore.getState().blocks[0]?.id).toBe(block.id);
  });
});
