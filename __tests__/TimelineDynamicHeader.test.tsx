import React from 'react';
import {cleanup, render, screen} from '@testing-library/react';

import {defaultLyricDocument} from '../src/store/lyrics';
import {DEFAULT_TIME_SIGNATURE, type SectionMarker} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {
  RULER_BASE_HEIGHT,
  RULER_LANE_GAP,
  RULER_LANE_HEIGHT,
  RULER_LANE_TOP,
  ROW_HEIGHT,
  TRACK_SIDEBAR_FOOTER_HEIGHT,
} from '../src/ui/timelineLayout';
import {timelineRulerHeight} from '../src/ui/timelineHeaderLayout';
import {TimelineGrid} from '../src/web/components/TimelineGrid';

const noop = () => undefined;
const noopImportAudio = async () => null;

function track(): DAWTrack {
  return {
    id: 'track-a',
    name: 'Track A',
    isMuted: false,
    isSolo: false,
    type: 'software_instrument',
    instrumentId: 'synth_lead',
    presetId: 'default',
    isRecordArmed: false,
    isLocked: false,
  };
}

function analysedSection(): SectionMarker {
  return {
    id: 'verse-analysis',
    name: 'Verse',
    startBeat: 0,
    lengthBeats: 4,
    analysis: {
      mood: 'focused',
      key: 'C major',
      meaning: 'A tight opening thought.',
      productionCue: 'muted synth pulse',
      lyricPreview: ['First line'],
      lyrics: ['First line'],
    },
  };
}

function resetStore(): void {
  useDAWStore.setState({
    isPlaying: false,
    isRecording: false,
    recordingBlockId: null,
    tracks: [],
    blocks: [],
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    playheadBeat: 0,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    snapGrid: DEFAULT_SNAP_GRID,
    isRelativeSnapEnabled: false,
    meterMap: [],
    tempoMap: [],
    scale: null,
    chord: null,
    sections: [],
    lyrics: defaultLyricDocument(),
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

function renderTimelineGrid(blocks: DAWBlock[] = []) {
  const tracks = [track()];
  useDAWStore.setState({tracks, blocks});
  return render(
    <TimelineGrid
      tracks={tracks}
      blocks={blocks}
      selectedBlockId={null}
      selectedBlockIds={[]}
      verticalScrollRef={React.createRef<HTMLDivElement>()}
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

function timelineSurface(container: HTMLElement): HTMLDivElement {
  return container.querySelector('.timeline-surface') as HTMLDivElement;
}

beforeEach(resetStore);
afterEach(cleanup);

test('sizes the timeline header to visible lyrics and marker lanes', () => {
  const singleLaneHeight = timelineRulerHeight({hasLyricsLane: true, hasMarkerLane: false});
  const fullHeaderHeight = timelineRulerHeight({hasLyricsLane: true, hasMarkerLane: true});
  let result = renderTimelineGrid();

  expect(timelineSurface(result.container).style.height)
    .toBe(`${RULER_BASE_HEIGHT + ROW_HEIGHT + TRACK_SIDEBAR_FOOTER_HEIGHT}px`);
  expect(timelineSurface(result.container).style.getPropertyValue('--timeline-ruler-height'))
    .toBe(`${RULER_BASE_HEIGHT}px`);
  result.unmount();

  useDAWStore.setState({sections: [{id: 'verse', name: 'Verse', startBeat: 0, lengthBeats: 4}]});
  result = renderTimelineGrid();
  expect(screen.getByLabelText('Marker lane')).toBeInTheDocument();
  expect(timelineSurface(result.container).style.height)
    .toBe(`${singleLaneHeight + ROW_HEIGHT + TRACK_SIDEBAR_FOOTER_HEIGHT}px`);
  expect(timelineSurface(result.container).style.getPropertyValue('--timeline-marker-lane-top'))
    .toBe(`${RULER_LANE_TOP}px`);
  result.unmount();

  const lyrics = defaultLyricDocument();
  lyrics.sections[0]!.lines[0] = {...lyrics.sections[0]!.lines[0]!, text: 'One written hook'};
  useDAWStore.setState({sections: [], lyrics});
  result = renderTimelineGrid();
  expect(screen.getByRole('button', {name: '[Section 1] authored lyrics'})).toBeInTheDocument();
  expect(screen.queryByLabelText('Marker lane')).not.toBeInTheDocument();
  expect(timelineSurface(result.container).style.height)
    .toBe(`${singleLaneHeight + ROW_HEIGHT + TRACK_SIDEBAR_FOOTER_HEIGHT}px`);
  result.unmount();

  useDAWStore.setState({lyrics: defaultLyricDocument(), sections: [analysedSection()]});
  result = renderTimelineGrid();
  expect(screen.getByRole('button', {name: 'Verse lyric analysis'})).toBeInTheDocument();
  expect(screen.getByLabelText('Marker lane')).toBeInTheDocument();
  expect(timelineSurface(result.container).style.height)
    .toBe(`${fullHeaderHeight + ROW_HEIGHT + TRACK_SIDEBAR_FOOTER_HEIGHT}px`);
  expect(timelineSurface(result.container).style.getPropertyValue('--timeline-marker-lane-top'))
    .toBe(`${RULER_LANE_TOP + RULER_LANE_HEIGHT + RULER_LANE_GAP}px`);
});
