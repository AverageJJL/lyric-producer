import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';

import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import type {useRecordingLaunch} from '../src/hooks/useRecordingLaunch';
import {ClipEditorDock} from '../src/web/components/ClipEditorDock';

type RecordingLaunch = ReturnType<typeof useRecordingLaunch>;

function mockRecordingLaunch(overrides: Partial<RecordingLaunch> = {}): RecordingLaunch {
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
    ...overrides,
  };
}

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
  sourcePeakAmplitude: 0.5,
  audioFilePath: 'imports/vocal.wav',
  absoluteAudioFilePath: '/tmp/imports/vocal.wav',
};

function resetStore(blocks: DAWBlock[] = [block], selectedBlockIds: string[] = [block.id]): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [track],
    patterns: {},
    blocks,
    selectedBlockId: selectedBlockIds[selectedBlockIds.length - 1] ?? null,
    selectedBlockIds,
    selectedTrackId: track.id,
    isRecording: false,
    recordingBlockId: null,
    recordingStartSeconds: null,
    recordingWallClockStart: null,
    recordingError: null,
    playheadBeat: 9,
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

describe('AudioClipEditorPanel', () => {
  beforeEach(() => {
    resetStore();
    mockSendNativeAudioCommand.mockImplementation((command: string) => {
      if (command === 'render_mixdown_async') {
        return JSON.stringify({ok: true, data: {requestId: 'render-1', status: 'running'}});
      }
      if (command === 'get_render_mixdown_status') {
        return JSON.stringify({ok: true, data: {requestId: 'render-1', status: 'completed'}});
      }
      if (command === 'analyze_audio_file') {
        return JSON.stringify({
          ok: true,
          data: {lengthBeats: 4, durationSeconds: 2, sampleRate: 48000},
        });
      }
      if (command === 'engine_status' || command === 'engine_status_fast') {
        return JSON.stringify({ok: true, data: {sampleRate: 48000}});
      }
      return JSON.stringify({ok: true});
    });
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
  });

  afterEach(() => {
    delete window.mediaImport;
    mockSendNativeAudioCommand.mockReset();
  });

  it('toggles track mute through the dock control', () => {
    render(<ClipEditorDock recordingLaunch={mockRecordingLaunch()} />);
    expect(screen.getByRole('region', {name: 'Audio clip editor'})).toBeInTheDocument();
    const muteButton = screen.getByRole('button', {name: 'Mute'});
    expect(muteButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(muteButton);
    expect(useDAWStore.getState().tracks[0]?.isMuted).toBe(true);
    expect(muteButton).toHaveAttribute('aria-pressed', 'true');
    act(() => useDAWStore.getState().undo());
    expect(useDAWStore.getState().tracks[0]?.isMuted).toBe(false);
  });

  it('slips selected audio clip source offset through dock controls', () => {
    render(<ClipEditorDock recordingLaunch={mockRecordingLaunch()} />);
    fireEvent.click(screen.getByRole('button', {name: 'Slip +'}));
    expect(useDAWStore.getState().blocks[0]?.sourceOffsetBeats).toBe(1.25);
    expect(screen.getByText(/Source 1.25 beats/)).toBeInTheDocument();
    act(() => useDAWStore.getState().undo());
    expect(useDAWStore.getState().blocks[0]?.sourceOffsetBeats).toBe(1);
  });

  it('trims selected audio clip source window through dock controls', () => {
    render(<ClipEditorDock recordingLaunch={mockRecordingLaunch()} />);
    fireEvent.click(screen.getByRole('button', {name: 'Trim Start +'}));
    expect(useDAWStore.getState().blocks[0]).toMatchObject({
      startBeat: 8.25,
      lengthBeats: 3.75,
      sourceOffsetBeats: 1.25,
    });
    expect(screen.getByText(/Source 1.25 beats/)).toBeInTheDocument();

    act(() => useDAWStore.getState().undo());

    fireEvent.click(screen.getByRole('button', {name: 'Trim End +'}));

    expect(useDAWStore.getState().blocks[0]?.lengthBeats).toBe(4.25);
  });

  it('slides selected audio clip timing through dock controls', () => {
    render(<ClipEditorDock recordingLaunch={mockRecordingLaunch()} />);

    fireEvent.click(screen.getByRole('button', {name: 'Slide +'}));

    expect(useDAWStore.getState().blocks[0]).toMatchObject({
      startBeat: 8.25,
      sourceOffsetBeats: 1,
    });

    act(() => useDAWStore.getState().undo());

    expect(useDAWStore.getState().blocks[0]).toMatchObject({
      startBeat: 8,
      sourceOffsetBeats: 1,
    });
  });

  it('edits selected audio clip gain through dock controls', () => {
    render(<ClipEditorDock recordingLaunch={mockRecordingLaunch()} />);

    fireEvent.click(screen.getByRole('button', {name: 'Gain -'}));

    expect(useDAWStore.getState().blocks[0]?.clipGainDb).toBe(-1);
    expect(screen.getByText(/Gain -1.0 dB/)).toBeInTheDocument();

    act(() => useDAWStore.getState().undo());

    expect(useDAWStore.getState().blocks[0]?.clipGainDb).toBeUndefined();
  });

  it('normalizes selected audio clip gain through dock controls', () => {
    render(<ClipEditorDock recordingLaunch={mockRecordingLaunch()} />);

    fireEvent.click(screen.getByRole('button', {name: 'Normalize'}));

    expect(useDAWStore.getState().blocks[0]?.clipGainDb).toBeCloseTo(5.0206, 4);
    expect(screen.getByText(/50% peak/)).toBeInTheDocument();

    act(() => useDAWStore.getState().undo());

    expect(useDAWStore.getState().blocks[0]?.clipGainDb).toBeUndefined();
  });

  it('edits selected audio clip fades through dock controls', () => {
    render(<ClipEditorDock recordingLaunch={mockRecordingLaunch()} />);

    fireEvent.click(screen.getByRole('button', {name: 'Fade In +'}));
    fireEvent.click(screen.getByRole('button', {name: 'Fade Out +'}));

    expect(useDAWStore.getState().blocks[0]?.fadeInBeats).toBe(0.25);
    expect(useDAWStore.getState().blocks[0]?.fadeOutBeats).toBe(0.25);
    expect(screen.getByText(/Fades 0.25 beats in \/ 0.25 beats out/)).toBeInTheDocument();

    act(() => useDAWStore.getState().undo());

    expect(useDAWStore.getState().blocks[0]?.fadeOutBeats).toBeUndefined();
  });

  it('crossfades adjacent selected audio clips through dock controls', () => {
    resetStore([
      block,
      {...block, id: 'clip-next', name: 'Next Vocal', startBeat: 12},
    ], [block.id, 'clip-next']);
    render(<ClipEditorDock recordingLaunch={mockRecordingLaunch()} />);

    fireEvent.click(screen.getByRole('button', {name: 'Crossfade'}));

    expect(useDAWStore.getState().blocks[0]?.fadeOutBeats).toBe(0.25);
    expect(useDAWStore.getState().blocks[1]?.fadeInBeats).toBe(0.25);

    act(() => useDAWStore.getState().undo());

    expect(useDAWStore.getState().blocks[0]?.fadeOutBeats).toBeUndefined();
    expect(useDAWStore.getState().blocks[1]?.fadeInBeats).toBeUndefined();
  });

  it('toggles selected audio clip reverse playback through dock controls', () => {
    render(<ClipEditorDock recordingLaunch={mockRecordingLaunch()} />);

    const reverseButton = screen.getByRole('button', {name: 'Reverse'});
    expect(reverseButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(reverseButton);

    expect(useDAWStore.getState().blocks[0]?.isReversed).toBe(true);
    expect(reverseButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Reversed source playback/)).toBeInTheDocument();

    act(() => useDAWStore.getState().undo());

    expect(useDAWStore.getState().blocks[0]?.isReversed).toBeUndefined();
  });

  it('renders selected audio clips in place through native mixdown', async () => {
    render(<ClipEditorDock recordingLaunch={mockRecordingLaunch()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'Render In Place'}));
    });

    expect(window.mediaImport?.prepareAudioRender).toHaveBeenCalledWith({
      defaultPath: 'Lead Vocal Render.wav',
    });
    expect(mockSendNativeAudioCommand).toHaveBeenCalledWith('render_mixdown_async', expect.objectContaining({
      path: '/tmp/assets/imports/render.wav',
      trackId: 'track-audio',
      startBeat: 8,
      endBeat: 12,
    }));
    await waitFor(() => {
      expect(useDAWStore.getState().blocks[0]).toMatchObject({
        audioFilePath: 'imports/render.wav',
        absoluteAudioFilePath: '/tmp/assets/imports/render.wav',
        sourceOffsetBeats: 0,
      });
    });
  });

});
