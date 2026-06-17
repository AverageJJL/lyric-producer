import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import {createEmptyPattern} from '../src/music/drumPatterns';
import {createDefaultDrumPatternBlock} from '../src/music/clipFactories';
import {createTrackFromTemplate} from '../src/music/trackTemplates';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {StepSequencerPanel} from '../src/web/components/StepSequencerPanel';

const mockSendNativeAudioCommand = jest.fn();

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: (...args: unknown[]) => mockSendNativeAudioCommand(...args),
}));

function resetStore() {
  const track = createTrackFromTemplate('drum_machine', 0, {id: 'track-drums'});
  const pattern = createEmptyPattern('Pattern A', 'pattern-drums');
  const block = createDefaultDrumPatternBlock(track.id, 0, 0, pattern.id, 'Pattern A');
  useDAWStore.setState({
    bpm: 120,
    isPlaying: false,
    isMetronomeEnabled: true,
    tracks: [track],
    patterns: {[pattern.id]: pattern},
    blocks: [block],
    selectedBlockId: block.id,
    selectedBlockIds: [block.id],
    selectedTrackId: track.id,
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
  return {track, block};
}

describe('StepSequencerPanel sample library requirements', () => {
  beforeEach(() => {
    resetArrangementHistoryForTests();
    mockSendNativeAudioCommand.mockReset();
  });

  it('shows Download Required and disables direct drum preview when the pack is missing', () => {
    const {track, block} = resetStore();
    const downloadDrums = jest.fn();
    const {container} = render(
      <StepSequencerPanel
        track={track}
        selectedBlockId={block.id}
        isDrumLibraryInstalled={false}
        onDownloadDrumLibrary={downloadDrums}
      />,
    );

    expect(screen.getByText('Download Required')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Play'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Kick'})).toBeDisabled();

    fireEvent.click(screen.getByRole('button', {name: 'Download Drums'}));
    expect(downloadDrums).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('.step-cell')!);
    expect(mockSendNativeAudioCommand).not.toHaveBeenCalledWith('play_sample', expect.anything());
  });
});
