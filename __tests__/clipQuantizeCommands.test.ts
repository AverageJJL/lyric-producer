import React from 'react';
import {cleanup, fireEvent, render} from '@testing-library/react';

import {quantizeSelectedMidiClips} from '../src/arrangement/clipEditCommands';
import {useUndoRedoShortcuts} from '../src/hooks/useUndoRedoShortcuts';
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
    tempoMap: [],
    meterMap: [],
    tracks: [{id: 'track-1', name: 'Lead', type: 'software_instrument', instrumentId: 'synth_lead', presetId: 'pop_lead', isMuted: false, isSolo: false, isRecordArmed: false, isLocked: false}],
    patterns: {},
    blocks: [
      {
        id: 'clip-1',
        trackId: 'track-1',
        name: 'Loose',
        startBeat: 0,
        lengthBeats: 4,
        type: 'midi',
        color: '#4a7fd4',
        notes: [{note: 60, velocity: 100, startBeat: 0.31, lengthBeats: 0.5}],
      },
      {
        id: 'clip-audio',
        trackId: 'track-1',
        name: 'Audio',
        startBeat: 4,
        lengthBeats: 4,
        type: 'audio',
        color: '#c45c26',
      },
    ],
    selectedBlockId: 'clip-1',
    selectedBlockIds: ['clip-1'],
    selectedTrackId: 'track-1',
    snapGrid: '1/8',
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
  });
  resetArrangementHistoryForTests();
}

function ShortcutProbe() {
  useUndoRedoShortcuts();
  return React.createElement('div');
}

describe('selected MIDI clip quantize command', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('quantizes selected MIDI notes to the active snap grid with one undo step', () => {
    expect(quantizeSelectedMidiClips()).toBe(true);
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.startBeat).toBe(0.5);
    expect(useDAWStore.getState().blocks[1]?.startBeat).toBe(4);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.startBeat).toBe(0.31);
  });

  it('falls back to sixteenth-note quantize when snap is off', () => {
    useDAWStore.setState({snapGrid: 'off'});

    expect(quantizeSelectedMidiClips()).toBe(true);
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.startBeat).toBe(0.25);
  });

  it('skips history for non-MIDI or already-quantized selections', () => {
    expect(quantizeSelectedMidiClips()).toBe(true);
    useDAWStore.getState().undo();

    useDAWStore.setState({
      selectedBlockId: 'clip-audio',
      selectedBlockIds: ['clip-audio'],
    });
    resetArrangementHistoryForTests();

    expect(quantizeSelectedMidiClips()).toBe(false);
    expect(useDAWStore.getState().canUndo()).toBe(false);
  });

  it('wires Q through the global arrangement shortcut', () => {
    render(React.createElement(ShortcutProbe));

    fireEvent.keyDown(window, {key: 'q'});
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.startBeat).toBe(0.5);
  });
});
