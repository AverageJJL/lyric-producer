import React from 'react';
import {cleanup, render, screen} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {buildTimelineRulerModel} from '../src/ui/timelineRulerMap';
import {TimelineRulerLayer} from '../src/web/components/TimelineRulerLayer';

afterEach(() => {
  cleanup();
});

describe('timeline ruler tempo and meter map rendering', () => {
  it('uses meter changes as bar boundaries for ruler and grid lines', () => {
    const model = buildTimelineRulerModel({
      visibleTimelineBeats: 14,
      snapGrid: 'beat',
      timeSignature: DEFAULT_TIME_SIGNATURE,
      meterMap: [
        {id: 'meter-six', beat: 6, timeSignature: {numerator: 3, denominator: 4}},
      ],
      tempoMap: [],
    });

    expect(model.rulerTicks.filter(tick => tick.isBar).map(tick => ({
      beat: tick.beat,
      label: tick.label,
    }))).toEqual([
      {beat: 0, label: '1'},
      {beat: 4, label: '2'},
      {beat: 6, label: '3'},
      {beat: 9, label: '4'},
      {beat: 12, label: '5'},
    ]);
    expect(model.gridLines.filter(line => line.kind === 'bar').map(line => line.beat))
      .toEqual([0, 4, 6, 9, 12]);
  });

  it('uses meter denominators when spacing mapped bars', () => {
    const model = buildTimelineRulerModel({
      visibleTimelineBeats: 16,
      snapGrid: 'beat',
      timeSignature: DEFAULT_TIME_SIGNATURE,
      meterMap: [
        {id: 'meter-eight', beat: 8, timeSignature: {numerator: 7, denominator: 8}},
      ],
      tempoMap: [],
    });

    expect(model.rulerTicks.filter(tick => tick.isBar).map(tick => ({
      beat: tick.beat,
      label: tick.label,
    }))).toEqual([
      {beat: 0, label: '1'},
      {beat: 4, label: '2'},
      {beat: 8, label: '3'},
      {beat: 11.5, label: '4'},
      {beat: 15, label: '5'},
    ]);
    expect(model.gridLines.filter(line => line.kind === 'bar').map(line => line.beat))
      .toEqual([0, 4, 8, 11.5, 15]);
  });

  it('renders tempo and meter markers on the ruler layer', () => {
    useDAWStore.setState({
      isCycleEnabled: false,
      cycleStartBeat: 0,
      cycleEndBeat: 4,
    });

    render(
        <TimelineRulerLayer
          visibleTimelineBeats={16}
          pixelsPerBeat={20}
          playheadBeat={0}
          snapGrid="beat"
          timeSignature={DEFAULT_TIME_SIGNATURE}
        meterMap={[
          {id: 'meter-eight', beat: 8, timeSignature: {numerator: 7, denominator: 8}},
        ]}
        tempoMap={[
          {id: 'tempo-eight', beat: 8, bpm: 132, ramp: 'linear'},
        ]}
        sections={[]}
        onRulerPointerDown={() => undefined}
        onSectionsChange={() => undefined}
        onJumpToBeat={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Tempo 132 BPM at beat 9')).toHaveTextContent('132');
    expect(screen.getByLabelText('Meter 7/8 at beat 9')).toHaveTextContent('7/8');
  });
});
