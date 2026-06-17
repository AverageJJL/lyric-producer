import React from 'react';
import {cleanup, fireEvent, render} from '@testing-library/react';

import {
  isArrangementDeleteShortcut,
  isCopyShortcut,
  isDuplicateShortcut,
  isGlueShortcut,
  isPasteShortcut,
  isRedoShortcut,
  isRepeatShortcut,
  isSplitShortcut,
  isTrimEndShortcut,
  isTrimStartShortcut,
  isTrimToSelectionShortcut,
  isUndoShortcut,
  useUndoRedoShortcuts,
} from '../src/hooks/useUndoRedoShortcuts';
import {
  isEditorToggleShortcut,
  isTransportPlayPauseShortcut,
  isTransportRecordShortcut,
  useTransportShortcuts,
} from '../src/hooks/useTransportShortcuts';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [],
    patterns: {},
    blocks: [],
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
  });
}

function ShortcutProbe() {
  useUndoRedoShortcuts();
  return React.createElement('div');
}

function TransportShortcutProbe({
  onRecord = () => undefined,
  onEditor = () => undefined,
}: {
  onRecord?: () => void;
  onEditor?: () => void;
}) {
  useTransportShortcuts({
    onTogglePlay: () => useDAWStore.getState().setIsPlaying(!useDAWStore.getState().isPlaying),
    onReturnToZero: () => useDAWStore.getState().setPlayheadBeat(0, {pauseIfPlaying: true}),
    onToggleRecord: onRecord,
    onToggleEditor: onEditor,
  });
  return React.createElement('input', {'aria-label': 'Editor input'});
}

describe('undo/redo shortcuts', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
  });

  it('detects Cmd+Z and Ctrl+Z as undo', () => {
    expect(isUndoShortcut({metaKey: true, ctrlKey: false, key: 'z', shiftKey: false})).toBe(true);
    expect(isUndoShortcut({metaKey: false, ctrlKey: true, key: 'Z', shiftKey: false})).toBe(true);
    expect(isUndoShortcut({metaKey: true, ctrlKey: false, key: 'z', shiftKey: true})).toBe(false);
  });

  it('detects Cmd+Y and Cmd+Shift+Z as redo', () => {
    expect(isRedoShortcut({metaKey: true, ctrlKey: false, key: 'y', shiftKey: false})).toBe(true);
    expect(isRedoShortcut({metaKey: false, ctrlKey: true, key: 'Y', shiftKey: false})).toBe(true);
    expect(isRedoShortcut({metaKey: true, ctrlKey: false, key: 'z', shiftKey: true})).toBe(true);
    expect(isRedoShortcut({metaKey: true, ctrlKey: false, key: 'z', shiftKey: false})).toBe(false);
  });

  it('detects unmodified Space as transport play/pause', () => {
    expect(
      isTransportPlayPauseShortcut({metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, code: 'Space', key: ' '}),
    ).toBe(true);
    expect(
      isTransportPlayPauseShortcut({metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, code: 'Space', key: ' ', repeat: true}),
    ).toBe(false);
    expect(
      isTransportPlayPauseShortcut({metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, code: 'Space', key: ' '}),
    ).toBe(false);
  });

  it('detects unmodified R and E as transport/editor shortcuts', () => {
    expect(
      isTransportRecordShortcut({metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: 'r'}),
    ).toBe(true);
    expect(
      isTransportRecordShortcut({metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: 'r', repeat: true}),
    ).toBe(false);
    expect(
      isTransportRecordShortcut({metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, key: 'r'}),
    ).toBe(false);
    expect(
      isEditorToggleShortcut({metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: 'E'}),
    ).toBe(true);
    expect(
      isEditorToggleShortcut({metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, key: 'e'}),
    ).toBe(false);
  });

  it('toggles play and pause with Space', () => {
    render(React.createElement(TransportShortcutProbe));

    expect(useDAWStore.getState().isPlaying).toBe(false);
    fireEvent.keyDown(window, {code: 'Space', key: ' '});
    expect(useDAWStore.getState().isPlaying).toBe(true);
    fireEvent.keyDown(window, {code: 'Space', key: ' '});
    expect(useDAWStore.getState().isPlaying).toBe(false);
  });

  it('dispatches R and E transport shortcuts outside editable fields only', () => {
    const onRecord = jest.fn();
    const onEditor = jest.fn();
    const {getByLabelText} = render(React.createElement(TransportShortcutProbe, {onRecord, onEditor}));

    fireEvent.keyDown(window, {key: 'r'});
    fireEvent.keyDown(window, {key: 'e'});

    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(onEditor).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, {key: 'r', repeat: true});
    fireEvent.keyDown(window, {key: 'e', metaKey: true});
    fireEvent.keyDown(getByLabelText('Editor input'), {key: 'r'});
    fireEvent.keyDown(getByLabelText('Editor input'), {key: 'e'});

    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(onEditor).toHaveBeenCalledTimes(1);
  });

  it('detects unmodified Backspace and Delete as arrangement deletion', () => {
    expect(isArrangementDeleteShortcut({metaKey: false, ctrlKey: false, altKey: false, key: 'Backspace'})).toBe(true);
    expect(isArrangementDeleteShortcut({metaKey: false, ctrlKey: false, altKey: false, key: 'Delete'})).toBe(true);
    expect(isArrangementDeleteShortcut({metaKey: false, ctrlKey: false, altKey: false, key: 'Backspace', repeat: true})).toBe(false);
    expect(isArrangementDeleteShortcut({metaKey: true, ctrlKey: false, altKey: false, key: 'Backspace'})).toBe(false);
  });

  it('detects edit command shortcuts', () => {
    expect(isCopyShortcut({metaKey: true, ctrlKey: false, shiftKey: false, key: 'c'})).toBe(true);
    expect(isPasteShortcut({metaKey: false, ctrlKey: true, shiftKey: false, key: 'v'})).toBe(true);
    expect(isDuplicateShortcut({metaKey: true, ctrlKey: false, shiftKey: false, key: 'd'})).toBe(true);
    expect(isSplitShortcut({metaKey: false, ctrlKey: true, shiftKey: false, key: 'b'})).toBe(true);
    expect(isGlueShortcut({metaKey: true, ctrlKey: false, shiftKey: false, key: 'j'})).toBe(true);
    expect(isRepeatShortcut({metaKey: true, ctrlKey: false, shiftKey: false, key: 'r'})).toBe(true);
    expect(isTrimStartShortcut({metaKey: true, ctrlKey: false, shiftKey: false, key: '['})).toBe(true);
    expect(isTrimEndShortcut({metaKey: false, ctrlKey: true, shiftKey: false, key: ']'})).toBe(true);
    expect(isTrimToSelectionShortcut({metaKey: true, ctrlKey: false, shiftKey: true, key: 'T'})).toBe(true);
    expect(isCopyShortcut({metaKey: true, ctrlKey: false, shiftKey: true, key: 'c'})).toBe(false);
  });

  it('undo and redo restore arrangement via store actions', () => {
    useDAWStore.getState().setBpm(150);
    expect(useDAWStore.getState().bpm).toBe(150);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().bpm).toBe(120);

    useDAWStore.getState().redo();
    expect(useDAWStore.getState().bpm).toBe(150);
  });

  it('deletes the selected track with Backspace and Cmd+Z restores it', () => {
    render(React.createElement(ShortcutProbe));

    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeDefined();

    useDAWStore.getState().selectTrack(trackId!);
    fireEvent.keyDown(window, {key: 'Backspace'});

    expect(useDAWStore.getState().tracks.some(track => track.id === trackId)).toBe(false);

    fireEvent.keyDown(window, {key: 'z', metaKey: true});
    expect(useDAWStore.getState().tracks.some(track => track.id === trackId)).toBe(true);
  });

  it('deletes the selected clip with Backspace and Cmd+Z restores it', () => {
    render(React.createElement(ShortcutProbe));

    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeDefined();

    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-1',
          trackId: trackId!,
          name: 'Take',
          startBeat: 0,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
      selectedBlockId: 'clip-1',
      selectedBlockIds: ['clip-1'],
      selectedTrackId: trackId!,
    });

    fireEvent.keyDown(window, {key: 'Backspace'});
    expect(useDAWStore.getState().blocks.some(block => block.id === 'clip-1')).toBe(false);

    fireEvent.keyDown(window, {key: 'Backspace', repeat: true});
    expect(useDAWStore.getState().tracks.some(track => track.id === trackId)).toBe(true);

    fireEvent.keyDown(window, {key: 'z', metaKey: true});
    expect(useDAWStore.getState().blocks.some(block => block.id === 'clip-1')).toBe(true);
  });

  it('deletes multiple selected clips with one undo step', () => {
    render(React.createElement(ShortcutProbe));

    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeDefined();

    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-1',
          trackId: trackId!,
          name: 'Take 1',
          startBeat: 0,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
        {
          id: 'clip-2',
          trackId: trackId!,
          name: 'Take 2',
          startBeat: 4,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
        {
          id: 'clip-3',
          trackId: trackId!,
          name: 'Keep',
          startBeat: 8,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
      selectedBlockId: 'clip-2',
      selectedBlockIds: ['clip-1', 'clip-2'],
      selectedTrackId: trackId!,
    });

    fireEvent.keyDown(window, {key: 'Delete'});
    expect(useDAWStore.getState().blocks.map(block => block.id)).toEqual(['clip-3']);
    expect(useDAWStore.getState().selectedBlockIds).toEqual([]);

    fireEvent.keyDown(window, {key: 'z', metaKey: true});
    expect(useDAWStore.getState().blocks.map(block => block.id)).toEqual([
      'clip-1',
      'clip-2',
      'clip-3',
    ]);
  });

  it('duplicates the selected clip with Cmd+D', () => {
    render(React.createElement(ShortcutProbe));

    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-1',
          trackId: trackId!,
          name: 'Take',
          startBeat: 0,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
      selectedBlockId: 'clip-1',
      selectedBlockIds: ['clip-1'],
      selectedTrackId: trackId!,
    });

    fireEvent.keyDown(window, {key: 'd', metaKey: true});

    expect(useDAWStore.getState().blocks).toHaveLength(2);
    expect(useDAWStore.getState().blocks[1]).toMatchObject({startBeat: 4});
  });
});
