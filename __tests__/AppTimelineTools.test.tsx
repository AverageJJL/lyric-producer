import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {PIXELS_PER_BEAT, ROW_HEIGHT} from '../src/ui/timelineLayout';
import {TimelineGrid} from '../src/web/components/TimelineGrid';

const noop = () => undefined;
const noopImportAudio = async () => null;

function resetStore(): void {
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [],
    patterns: {},
    blocks: [],
    snapGrid: DEFAULT_SNAP_GRID,
    isRelativeSnapEnabled: false,
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

beforeEach(() => {
  resetStore();
  window.PointerEvent =
    window.PointerEvent ??
    (class MockPointerEvent extends MouseEvent {
      pointerId: number;

      constructor(type: string, props: PointerEventInit = {}) {
        super(type, props);
        this.pointerId = props.pointerId ?? 0;
      }
    } as typeof PointerEvent);
});

afterEach(() => {
  cleanup();
});

function renderTimelineGrid(options: {
  tracks?: DAWTrack[];
  blocks?: DAWBlock[];
  selectedBlockIds?: string[];
} = {}) {
  const tracks = options.tracks ?? [];
  const blocks = options.blocks ?? [];
  const selectedBlockIds = options.selectedBlockIds ?? [];
  useDAWStore.setState({tracks, blocks, selectedBlockId: null, selectedBlockIds});
  const verticalScrollRef = React.createRef<HTMLDivElement>();
  return render(
    <TimelineGrid
      tracks={tracks}
      blocks={blocks}
      selectedBlockId={null}
      selectedBlockIds={selectedBlockIds}
      verticalScrollRef={verticalScrollRef}
      onVerticalScroll={noop}
      rowHeight={ROW_HEIGHT}
      expandedTakeGroups={[]}
      onToggleTakeFolder={noop}
      onRowHeightChange={noop}
      onMoveBlock={noop}
      onResizeBlock={noop}
      onSelectBlock={noop}
      onUpdateBlock={noop}
      onDeleteBlock={noop}
      importAudioFile={noopImportAudio}
      onTimelineMediaDropHandled={noop}
    />,
  );
}

function setMarkerLaneRect(left = 100): void {
  const lane = screen.getByLabelText('Marker lane') as HTMLDivElement;
  lane.getBoundingClientRect = () => ({
    left,
    top: 0,
    right: left + 64 * PIXELS_PER_BEAT,
    bottom: 21,
    width: 64 * PIXELS_PER_BEAT,
    height: 21,
    x: left,
    y: 0,
    toJSON: () => ({}),
  });
}

function setTimelineSurfaceRect(left = 100): HTMLDivElement {
  const surface = document.querySelector('.timeline-surface') as HTMLDivElement;
  surface.getBoundingClientRect = () => ({
    left,
    top: 0,
    right: left + 64 * PIXELS_PER_BEAT,
    bottom: 400,
    width: 64 * PIXELS_PER_BEAT,
    height: 400,
    x: left,
    y: 0,
    toJSON: () => ({}),
  });
  return surface;
}

test('changes the arrangement snap grid from the timeline toolbar', () => {
  renderTimelineGrid();
  const toolbar = document.querySelector('.timeline-toolbar') as HTMLElement;

  expect(screen.queryByText('Arrangement')).not.toBeInTheDocument();
  expect(screen.queryByText(/\d+ tracks?/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Jump Clip'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Fit Sel'})).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Relative snap')).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Add Marker'})).toHaveTextContent('+Marker');

  fireEvent.change(screen.getByLabelText('Snap grid'), {target: {value: '1/16'}});

  expect(useDAWStore.getState().snapGrid).toBe('1/16');
  expect(toolbar.textContent?.indexOf('Marker')).toBeLessThan(toolbar.textContent?.indexOf('Snap') ?? -1);
  expect(toolbar.querySelector('.timeline-toolbar-meta')?.children[0]).toContainElement(screen.getByLabelText('Snap grid'));
  expect(toolbar.querySelector('.timeline-toolbar-meta')?.children[1]).toContainElement(screen.getByRole('button', {name: 'Fit'}));
  expect(toolbar.querySelector('.timeline-toolbar-meta')?.children[2]).toHaveAttribute('aria-label', 'Timeline zoom');

  fireEvent.change(screen.getByLabelText('Snap grid'), {target: {value: '1/8T'}});

  expect(useDAWStore.getState().snapGrid).toBe('1/8T');
});

test('adds a visible marker at the playhead from the timeline toolbar', () => {
  useDAWStore.getState().setPlayheadBeat(8, {syncTransport: false});
  renderTimelineGrid();

  fireEvent.click(screen.getByRole('button', {name: 'Add Marker'}));

  expect(useDAWStore.getState().sections[0]).toMatchObject({
    name: 'Marker 1',
    startBeat: 8,
    lengthBeats: 4,
  });
  expect(screen.getByLabelText('Marker lane')).toBeTruthy();
  expect(screen.getByText('Marker 1')).toBeTruthy();

  act(() => {
    useDAWStore.getState().undo();
  });
  expect(useDAWStore.getState().sections).toEqual([]);
});

test('clicking the ruler moves the playhead and pauses playback', () => {
  useDAWStore.setState({isPlaying: true, playheadBeat: 0});
  renderTimelineGrid();
  setTimelineSurfaceRect();
  const ruler = document.querySelector('.ruler-row') as HTMLDivElement;
  ruler.getBoundingClientRect = () => ({
    left: 100,
    top: 0,
    right: 100 + 64 * PIXELS_PER_BEAT,
    bottom: 24,
    width: 64 * PIXELS_PER_BEAT,
    height: 24,
    x: 100,
    y: 0,
    toJSON: () => ({}),
  });

  fireEvent.pointerDown(ruler, {clientX: 100 + 10 * PIXELS_PER_BEAT});

  expect(useDAWStore.getState().playheadBeat).toBe(10);
  expect(useDAWStore.getState().isPlaying).toBe(false);
});

test('ruler-band clicks still move playhead when an overlay receives the pointer', () => {
  renderTimelineGrid();
  const surface = setTimelineSurfaceRect();

  fireEvent.pointerDown(surface, {
    clientX: 100 + 12 * PIXELS_PER_BEAT,
    clientY: 8,
  });

  expect(useDAWStore.getState().playheadBeat).toBe(12);
});

test('removed timeline toolbar controls stay hidden', () => {
  renderTimelineGrid();

  expect(screen.queryByRole('button', {name: 'Jump Clip'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Fit Sel'})).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Relative snap')).not.toBeInTheDocument();
});

test('zooms and fits the timeline from the toolbar', () => {
  renderTimelineGrid();
  const surface = document.querySelector('.timeline-surface') as HTMLDivElement;
  const scroll = document.querySelector('.timeline-horizontal-scroll') as HTMLDivElement;

  expect(surface.style.width).toBe(`${64 * PIXELS_PER_BEAT}px`);

  fireEvent.change(screen.getByLabelText('Timeline horizontal zoom'), {
    target: {value: String(PIXELS_PER_BEAT + 12)},
  });
  expect(surface.style.width).toBe(`${64 * (PIXELS_PER_BEAT + 12)}px`);

  Object.defineProperty(scroll, 'clientWidth', {configurable: true, value: 1536});
  const fitButton = screen.getByRole('button', {name: 'Fit'});
  expect(fitButton).not.toHaveTextContent('Fit');
  expect(fitButton.querySelector('svg')).not.toBeNull();
  fireEvent.click(fitButton);

  expect(surface.style.width).toBe('1536px');
});

test('clicking a marker jumps the playhead to the marker start', () => {
  useDAWStore.getState().setSections([
    {id: 'verse', name: 'Verse', startBeat: 12, lengthBeats: 4},
  ]);
  renderTimelineGrid();

  fireEvent.click(screen.getByLabelText('Move marker Verse'));

  expect(useDAWStore.getState().playheadBeat).toBe(12);
  expect(screen.queryByLabelText('Duplicate section Verse')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Split section Verse')).toBeInTheDocument();
});

test('moves marker chips with snap and one undoable commit', () => {
  useDAWStore.getState().setPlayheadBeat(8, {syncTransport: false});
  renderTimelineGrid();

  fireEvent.click(screen.getByRole('button', {name: 'Add Marker'}));
  setMarkerLaneRect();

  const moveButton = screen.getByLabelText('Move marker Marker 1');
  fireEvent.pointerDown(moveButton, {
    button: 0,
    pointerId: 1,
    clientX: 100 + 9 * PIXELS_PER_BEAT,
  });
  fireEvent.pointerMove(moveButton, {
    pointerId: 1,
    clientX: 100 + 13.2 * PIXELS_PER_BEAT,
  });
  fireEvent.pointerUp(moveButton, {
    pointerId: 1,
    clientX: 100 + 13.2 * PIXELS_PER_BEAT,
  });

  expect(useDAWStore.getState().sections[0]).toMatchObject({
    startBeat: 12,
    lengthBeats: 4,
  });

  act(() => {
    useDAWStore.getState().undo();
  });
  expect(useDAWStore.getState().sections[0]).toMatchObject({
    startBeat: 8,
    lengthBeats: 4,
  });
});

test('resizes marker ends from the marker lane', () => {
  useDAWStore.getState().setSections([
    {id: 'verse', name: 'Verse', startBeat: 4, lengthBeats: 4},
  ]);
  renderTimelineGrid();
  setMarkerLaneRect();

  const endHandle = screen.getByLabelText('Resize marker end Verse');
  fireEvent.pointerDown(endHandle, {
    button: 0,
    pointerId: 2,
    clientX: 100 + 8 * PIXELS_PER_BEAT,
  });
  fireEvent.pointerUp(endHandle, {
    pointerId: 2,
    clientX: 100 + 10.4 * PIXELS_PER_BEAT,
  });

  expect(useDAWStore.getState().sections[0]).toMatchObject({
    startBeat: 4,
    lengthBeats: 6,
  });
});
