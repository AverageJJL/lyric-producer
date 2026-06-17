import React from 'react';
import {render, screen} from '@testing-library/react';

import type {DAWTrack} from '../src/store/useDAWStore';
import {
  automationLaneLabel,
  automationValueFromLaneRatio,
  buildTimelineAutomationLanes,
} from '../src/ui/timelineAutomationLanes';
import {buildTimelineTrackLaneLayout} from '../src/ui/timelineTrackLanes';
import {TimelineAutomationLanes} from '../src/web/components/TimelineAutomationLanes';

const track: DAWTrack = {
  id: 'track-keys',
  name: 'Keys',
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isMuted: false,
  isSolo: false,
  isRecordArmed: false,
  isLocked: false,
  automationMode: 'touch',
  automationLanes: [
    {
      targetType: 'track',
      parameterId: 'volumeDb',
      points: [{beat: 4, value: -6}, {beat: 18, value: -3}],
    },
    {
      targetType: 'fx',
      parameterId: 'eq.dryWet',
      points: [{beat: 8, value: 0.75}],
    },
  ],
};

describe('timeline automation lanes', () => {
  const trackLaneLayout = buildTimelineTrackLaneLayout([track], 96);

  it('builds visible lane rows from track automation metadata', () => {
    const lanes = buildTimelineAutomationLanes({
      tracks: [track],
      visibleTimelineBeats: 12,
    });

    expect(lanes).toEqual([
      {
        trackId: 'track-keys',
        trackName: 'Keys',
        laneKey: 'track:volumeDb',
        label: 'Volume',
        targetType: 'track',
        parameterId: 'volumeDb',
        laneIndex: 0,
        points: [{beat: 4, value: -6}],
      },
      {
        trackId: 'track-keys',
        trackName: 'Keys',
        laneKey: 'fx:eq.dryWet',
        label: 'EQ Mix',
        targetType: 'fx',
        parameterId: 'eq.dryWet',
        laneIndex: 1,
        points: [{beat: 8, value: 0.75}],
      },
    ]);
    expect(automationLaneLabel({targetType: 'instrument', parameterId: 'filter.cutoff'}))
      .toBe('Cutoff');
    expect(automationLaneLabel({targetType: 'instrument', parameterId: 'filter.resonance'}))
      .toBe('Resonance');
    expect(automationValueFromLaneRatio({targetType: 'track', parameterId: 'volumeDb'}, 0))
      .toBe(6);
    expect(automationValueFromLaneRatio({targetType: 'track', parameterId: 'pan'}, 1))
      .toBe(-1);
  });

  it('renders lane labels and automation point markers on the timeline', () => {
    render(
      <TimelineAutomationLanes
        tracks={[track]}
        visibleTimelineBeats={12}
        pixelsPerBeat={20}
        trackLaneLayout={trackLaneLayout}
      />,
    );

    expect(screen.getByLabelText('Timeline automation lanes')).toBeInTheDocument();
    expect(screen.getByLabelText('Automation lane Volume for Keys')).toHaveTextContent('Volume');
    expect(screen.getByLabelText('Automation lane EQ Mix for Keys')).toHaveTextContent('EQ Mix');
    expect(screen.getByLabelText('Volume automation point for Keys at beat 5, value -6'))
      .toBeInTheDocument();
    expect(screen.queryByLabelText('Volume automation point for Keys at beat 19, value -3'))
      .not.toBeInTheDocument();
  });

  it('writes points by clicking a lane and removes points by clicking a marker', () => {
    const onPointSet = jest.fn();
    const onPointRemove = jest.fn();
    render(
      <TimelineAutomationLanes
        tracks={[track]}
        visibleTimelineBeats={12}
        pixelsPerBeat={20}
        trackLaneLayout={trackLaneLayout}
        onPointSet={onPointSet}
        onPointRemove={onPointRemove}
      />,
    );

    const lane = screen.getByLabelText('Automation lane Volume for Keys');
    jest.spyOn(lane, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 100,
      top: 100,
      left: 0,
      bottom: 113,
      right: 240,
      width: 240,
      height: 13,
      toJSON: () => ({}),
    });

    lane.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: 100,
      clientY: 106.5,
    }));
    screen.getByLabelText('Volume automation point for Keys at beat 5, value -6').click();

    expect(onPointSet).toHaveBeenCalledWith(
      'track-keys',
      'track',
      'volumeDb',
      5,
      -27,
    );
    expect(onPointRemove).toHaveBeenCalledWith('track-keys', 'track', 'volumeDb', 4);
  });
});
