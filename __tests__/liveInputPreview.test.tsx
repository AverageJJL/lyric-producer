import React from 'react';
import {render, screen} from '@testing-library/react';

import {emptyLiveMidiPreview} from '../src/store/livePreview';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import type {DAWBlock} from '../src/store/useDAWStore';
import {useDAWStore} from '../src/store/useDAWStore';
import {buildTimelineTrackLaneLayout} from '../src/ui/timelineTrackLanes';
import {ClipContent} from '../src/web/components/ClipContent';
import {TimelineBlock} from '../src/web/components/TimelineBlock';

function resetStore(): void {
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
    playheadBeat: 2,
    playheadSeconds: 0,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    playStartSeconds: 0,
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
    midiAudition: null,
  });
}

const block: DAWBlock = {
  id: 'clip-1',
  trackId: 'track-1',
  name: 'Keys',
  startBeat: 0,
  lengthBeats: 4,
  type: 'midi',
  color: '#4a7fd4',
  notes: [],
};

const noop = () => undefined;

describe('live input preview UI', () => {
  beforeEach(() => {
    resetStore();
  });

  it('does not render AUD badge during keyboard audition', () => {
    useDAWStore.setState({midiAudition: {trackId: 'track-1', source: 'keyboard'}});
    const {container} = render(
      <TimelineBlock
        block={block}
        blocks={[block]}
        top={0}
        isSelected
        isGroupSelected={false}
        trackCount={1}
        maxTimelineBeat={16}
        pixelsPerBeat={48}
        rowHeight={96}
        trackLaneLayout={buildTimelineTrackLaneLayout([{id: 'track-1'}])}
        snapGrid="beat"
        isRelativeSnapEnabled={false}
        beatsPerBar={4}
        onMoveBlock={noop}
        onResizeBlock={noop}
        onSelectBlock={noop}
        onUpdateBlock={noop}
        onDeleteBlock={noop}
        onDraggingChange={noop}
        trackIds={['track-1']}
      />,
    );
    expect(screen.queryByText('AUD')).toBeNull();
    expect(container.querySelector('.midi-audition-badge')).toBeNull();
    expect(container.querySelector('.midi-clip-preview.auditioning')).toBeNull();
  });

  it('keeps keyboard preview notes out of committed clip thumbnails', () => {
    useDAWStore.setState({
      liveMidiPreviewByTrack: {
        'track-1': {
          ...emptyLiveMidiPreview('track-1', 'clip-1', 0),
          active: {67: {startBeat: 1, velocity: 100}},
        },
      },
    });

    const committedBlock = {
      ...block,
      notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
    };
    const {container} = render(
      <ClipContent block={committedBlock} widthPx={200} heightPx={48} />,
    );
    expect(container.querySelectorAll('.midi-note-preview')).toHaveLength(1);
    expect(screen.queryByText('No notes')).toBeNull();
  });

  it('renders live audio peaks on recording block without final waveform', () => {
    const audioBlock: DAWBlock = {
      id: 'rec-audio',
      trackId: 'track-v',
      name: 'Recording',
      startBeat: 0,
      lengthBeats: 4,
      type: 'audio',
      color: '#c45',
    };
    useDAWStore.setState({
      liveAudioPreviewByClip: {
        'rec-audio': {trackId: 'track-v', clipId: 'rec-audio', peaks: [0.1, 0.6, 0.3, 0.9]},
      },
    });

    const {container} = render(
      <ClipContent block={audioBlock} widthPx={240} heightPx={48} />,
    );
    expect(container.querySelector('.waveform-fill')).toBeTruthy();
  });

  it('shows boosted clip gain on audio waveform previews', () => {
    const audioBlock: DAWBlock = {
      id: 'clip-hot',
      trackId: 'track-v',
      name: 'Hot Clip',
      startBeat: 0,
      lengthBeats: 4,
      type: 'audio',
      color: '#c45',
      audioFilePath: 'imports/hot.wav',
      waveformPeaks: [0.2, 0.6, 0.4],
      clipGainDb: 6,
    };

    const {container} = render(
      <ClipContent block={audioBlock} widthPx={240} heightPx={48} />,
    );

    expect(container.querySelector('.waveform-preview.gain-boosted')).toBeTruthy();
    expect(screen.getByText('+6.0 dB')).toBeInTheDocument();
  });
});
