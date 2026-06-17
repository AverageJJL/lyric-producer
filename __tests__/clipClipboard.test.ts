import React from 'react';
import {cleanup, fireEvent, render} from '@testing-library/react';

import {
  arrangementClipboardAction,
  useUndoRedoShortcuts,
} from '../src/hooks/useUndoRedoShortcuts';
import {
  copySelectedBlockToClipboard,
  cutSelectedBlockToClipboard,
  getClipboardPayloadForTests,
  pasteClipboardToArrangement,
  playheadAfterPastedBlock,
  resetClipboardForTests,
} from '../src/arrangement/clipClipboard';
import {BEATS_PER_BAR} from '../src/music/drumPatterns';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => '{"ok":true}'),
}));

function resetStore(): void {
  resetArrangementHistoryForTests();
  resetClipboardForTests();
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
    playheadBeat: 4,
    playheadSeconds: 2,
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

describe('clip clipboard', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
  });

  it('detects Cmd+C, Cmd+X, and Cmd+V', () => {
    expect(arrangementClipboardAction({metaKey: true, ctrlKey: false, key: 'c', shiftKey: false, altKey: false})).toBe('copy');
    expect(arrangementClipboardAction({metaKey: true, ctrlKey: false, key: 'x', shiftKey: false, altKey: false})).toBe('cut');
    expect(arrangementClipboardAction({metaKey: true, ctrlKey: false, key: 'v', shiftKey: false, altKey: false})).toBe('paste');
    expect(arrangementClipboardAction({metaKey: true, ctrlKey: false, key: 'c', shiftKey: true, altKey: false})).toBe(null);
  });

  it('copies and pastes a MIDI block on a selected software-instrument track at the playhead', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;

    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-src',
          trackId,
          name: 'Melody',
          startBeat: 0,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
        },
      ],
      selectedBlockId: 'clip-src',
      selectedTrackId: trackId,
      playheadBeat: 8,
    });

    expect(copySelectedBlockToClipboard()).toBe(true);
    expect(pasteClipboardToArrangement()).toBe(true);

    const state = useDAWStore.getState();
    expect(state.blocks).toHaveLength(2);
    const pasted = state.blocks.find(block => block.id !== 'clip-src');
    expect(pasted).toBeDefined();
    expect(pasted!.trackId).toBe(trackId);
    expect(pasted!.startBeat).toBe(8);
    expect(pasted!.notes).toEqual([{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}]);
    expect(state.selectedBlockId).toBe(pasted!.id);
    expect(state.playheadBeat).toBe(12);
  });

  it('pastes at the playhead and splits an overlapping clip instead of snapping past it', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;

    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-existing',
          trackId,
          name: 'Long',
          startBeat: 0,
          lengthBeats: 16,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
        {
          id: 'clip-copy',
          trackId,
          name: 'Short',
          startBeat: 32,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
        },
      ],
      selectedBlockId: 'clip-copy',
      selectedTrackId: trackId,
      playheadBeat: 8,
    });

    copySelectedBlockToClipboard();
    pasteClipboardToArrangement();

    const state = useDAWStore.getState();
    const pasted = state.blocks.find(block => block.id.startsWith('block-paste'));
    expect(pasted).toBeDefined();
    expect(pasted!.startBeat).toBe(8);
    expect(state.blocks.find(block => block.id === 'clip-existing')).toMatchObject({
      startBeat: 0,
      lengthBeats: 8,
    });
    expect(state.blocks.find(block => block.id === 'clip-existing-tail-12')).toMatchObject({
      startBeat: 12,
      lengthBeats: 4,
    });
  });

  it('removes an existing clip fully covered by a paste at the playhead', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;

    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-existing',
          trackId,
          name: 'Target',
          startBeat: 8,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
        {
          id: 'clip-copy',
          trackId,
          name: 'Take',
          startBeat: 0,
          lengthBeats: 8,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
      selectedBlockId: 'clip-copy',
      selectedTrackId: trackId,
      playheadBeat: 8,
    });

    copySelectedBlockToClipboard();
    pasteClipboardToArrangement();

    const state = useDAWStore.getState();
    const pasted = state.blocks.find(block => block.id.startsWith('block-paste'));
    expect(pasted).toMatchObject({startBeat: 8, lengthBeats: 8});
    expect(state.blocks.find(block => block.id === 'clip-existing')).toBeUndefined();
  });

  it('pastes over an existing clip at the playhead while playing without moving playhead', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;

    useDAWStore.setState({
      isPlaying: true,
      blocks: [
        {
          id: 'clip-existing',
          trackId,
          name: 'Long',
          startBeat: 0,
          lengthBeats: 16,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
        {
          id: 'clip-copy',
          trackId,
          name: 'Short',
          startBeat: 32,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
      selectedBlockId: 'clip-copy',
      selectedTrackId: trackId,
      playheadBeat: 8,
    });

    copySelectedBlockToClipboard();
    pasteClipboardToArrangement();

    const state = useDAWStore.getState();
    const pasted = state.blocks.find(block => block.id.startsWith('block-paste'));
    expect(pasted!.startBeat).toBe(8);
    expect(state.playheadBeat).toBe(8);
    expect(state.blocks.find(block => block.id === 'clip-existing')).toMatchObject({
      startBeat: 0,
      lengthBeats: 8,
    });
  });

  it('advances playhead after one bar for extended drum pattern clips', () => {
    const block: DAWBlock = {
      id: 'drum-1',
      trackId: 't1',
      name: 'Beat',
      startBeat: 16,
      lengthBeats: BEATS_PER_BAR * 2,
      type: 'audio',
      color: '#c45c26',
      patternId: 'pat-1',
      sourceLengthBeats: BEATS_PER_BAR * 2,
      sourceOffsetBeats: 0,
    };
    expect(playheadAfterPastedBlock(block)).toBe(16 + BEATS_PER_BAR);
  });

  it('cut removes the original block but keeps clipboard pasteable', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;

    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-cut',
          trackId,
          name: 'Bass',
          startBeat: 0,
          lengthBeats: 2,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
      selectedBlockId: 'clip-cut',
      selectedTrackId: trackId,
      playheadBeat: 4,
    });

    expect(cutSelectedBlockToClipboard()).toBe(true);
    expect(useDAWStore.getState().blocks.some(block => block.id === 'clip-cut')).toBe(false);
    expect(pasteClipboardToArrangement()).toBe(true);
    expect(useDAWStore.getState().blocks).toHaveLength(1);
  });

  it('rejects paste onto voice audio tracks', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const midiTrackId = useDAWStore.getState().tracks[0]!.id;

    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-midi',
          trackId: midiTrackId,
          name: 'Keys',
          startBeat: 0,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
      selectedBlockId: 'clip-midi',
    });

    copySelectedBlockToClipboard();

    useDAWStore.getState().addTrackFromTemplate('voice_audio');
    const voiceTrackId = useDAWStore.getState().tracks.find(track => track.type === 'voice_audio')!.id;
    useDAWStore.getState().selectTrack(voiceTrackId);

    expect(pasteClipboardToArrangement()).toBe(false);
    expect(useDAWStore.getState().blocks).toHaveLength(1);
  });

  it('clones drum patterns so pasted edits do not affect the source', () => {
    useDAWStore.getState().addTrackFromTemplate('drum_machine');
    const trackId = useDAWStore.getState().tracks[0]!.id;
    const patternId = 'pattern-src';

    useDAWStore.setState({
      patterns: {
        [patternId]: {
          id: patternId,
          name: 'Pattern A',
          steps: {
            kick: [true, ...Array.from({length: 15}, () => false)],
            snare: Array.from({length: 16}, () => false),
            hatClosed: Array.from({length: 16}, () => false),
            hatOpen: Array.from({length: 16}, () => false),
            tom1: Array.from({length: 16}, () => false),
            tom2: Array.from({length: 16}, () => false),
            perc: Array.from({length: 16}, () => false),
            clap: Array.from({length: 16}, () => false),
          },
        },
      },
      blocks: [
        {
          id: 'drum-src',
          trackId,
          name: 'Beat',
          startBeat: 0,
          lengthBeats: BEATS_PER_BAR * 2,
          type: 'audio',
          color: '#c45c26',
          patternId,
          sourceLengthBeats: BEATS_PER_BAR * 2,
          sourceOffsetBeats: 0,
        },
      ],
      selectedBlockId: 'drum-src',
      selectedTrackId: trackId,
      playheadBeat: 16,
    });

    copySelectedBlockToClipboard();
    pasteClipboardToArrangement();

    const pasted = useDAWStore.getState().blocks.find(block => block.id !== 'drum-src');
    expect(pasted?.patternId).toBeDefined();
    expect(pasted!.patternId).not.toBe(patternId);

    const pastedPattern = useDAWStore.getState().patterns[pasted!.patternId!];
    pastedPattern.steps.kick[0] = false;

    expect(useDAWStore.getState().patterns[patternId].steps.kick[0]).toBe(true);
    expect(useDAWStore.getState().playheadBeat).toBe(16 + BEATS_PER_BAR);
  });

  it('wires Cmd+C and Cmd+V through the global shortcut hook', () => {
    render(React.createElement(ShortcutProbe));

    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;

    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-hook',
          trackId,
          name: 'Hook',
          startBeat: 0,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
      selectedBlockId: 'clip-hook',
      selectedTrackId: trackId,
      playheadBeat: 16,
    });

    fireEvent.keyDown(window, {key: 'c', metaKey: true});
    expect(getClipboardPayloadForTests()).not.toBeNull();

    fireEvent.keyDown(window, {key: 'v', metaKey: true});
    expect(useDAWStore.getState().blocks).toHaveLength(2);
  });

  it('undo restores arrangement after paste', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;

    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-undo',
          trackId,
          name: 'Lead',
          startBeat: 0,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
      selectedBlockId: 'clip-undo',
      selectedTrackId: trackId,
      playheadBeat: 4,
    });

    copySelectedBlockToClipboard();
    pasteClipboardToArrangement();
    expect(useDAWStore.getState().blocks).toHaveLength(2);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks).toHaveLength(1);
  });
});
