import React from 'react';
import {fireEvent} from '@testing-library/react';

import {useUndoRedoShortcuts} from '../../src/hooks/useUndoRedoShortcuts';
import {resetArrangementHistoryForTests} from '../../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../../src/store/useDAWStore';
import {noteRow, PIANO_ROLL_LANE_COUNT} from '../../src/web/components/pianoRollGeometry';

export const track: DAWTrack = {
  id: 'track-1',
  name: 'Keys',
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'keys_piano',
  presetId: 'splendid_grand_lite',
  isRecordArmed: false,
  isLocked: false,
};

export const block: DAWBlock = {
  id: 'clip-1',
  trackId: track.id,
  name: 'Hook',
  startBeat: 4,
  lengthBeats: 4,
  type: 'midi',
  color: '#4a7fd4',
  notes: [{note: 60, velocity: 90, startBeat: 0.13, lengthBeats: 0.5}],
};

export function resetPianoRollStore() {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [track],
    patterns: {},
    blocks: [block],
    selectedBlockId: block.id,
    selectedBlockIds: [block.id],
    selectedTrackId: track.id,
    isRecording: false,
    recordingBlockId: null,
    recordingStartSeconds: null,
    recordingWallClockStart: null,
    recordingError: null,
    playheadBeat: 5.1,
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

export function installGridRect(grid: HTMLDivElement) {
  const rect = {left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800, x: 0, y: 0};
  grid.getBoundingClientRect = () => ({...rect, toJSON: () => ({})});
}

export function noteY(note: number): number {
  return ((noteRow(note) + 0.5) / PIANO_ROLL_LANE_COUNT) * 800;
}

export function penNote(
  grid: HTMLDivElement,
  {x, y, endX = x, ctrlKey = false}: {x: number; y: number; endX?: number; ctrlKey?: boolean},
) {
  fireEvent.pointerDown(grid, {pointerId: 9, metaKey: !ctrlKey, ctrlKey, clientX: x, clientY: y});
  if (endX !== x) {
    fireEvent.pointerMove(grid, {pointerId: 9, metaKey: !ctrlKey, ctrlKey, clientX: endX, clientY: y});
  }
  fireEvent.pointerUp(grid, {pointerId: 9, metaKey: !ctrlKey, ctrlKey, clientX: endX, clientY: y});
}

export function ShortcutProbe() {
  useUndoRedoShortcuts();
  return null;
}
