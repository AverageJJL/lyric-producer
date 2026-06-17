import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import type {DAWTrack} from '../src/store/useDAWStore';
import {useMixMeterStore} from '../src/store/mixMeterStore';
import {TrackMixControls} from '../src/web/components/TrackMixControls';

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
  automationMode: 'read',
  volumeDb: -6,
  pan: 0.25,
  gainDb: 3,
};

describe('TrackMixControls', () => {
  beforeEach(() => useMixMeterStore.getState().clear());

  it('dispatches volume, pan, and gain trim edits', () => {
    const onInputMonitoringChange = jest.fn();
    const onAutomationModeChange = jest.fn();
    const onVolumeChange = jest.fn();
    const onPanChange = jest.fn();
    const onGainChange = jest.fn();

    render(
      <TrackMixControls
        track={track}
        onInputMonitoringChange={onInputMonitoringChange}
        onAutomationModeChange={onAutomationModeChange}
        onVolumeChange={onVolumeChange}
        onPanChange={onPanChange}
        onGainChange={onGainChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Volume for Keys'), {target: {value: '-12'}});
    fireEvent.change(screen.getByLabelText('Pan for Keys'), {target: {value: '-0.5'}});
    fireEvent.change(screen.getByLabelText('Gain trim for Keys'), {target: {value: '4.5'}});

    expect(onVolumeChange).toHaveBeenCalledWith('track-keys', -12);
    expect(onPanChange).toHaveBeenCalledWith('track-keys', -0.5);
    expect(onGainChange).toHaveBeenCalledWith('track-keys', 4.5);
  });

  it('dispatches input monitoring and automation policy changes', () => {
    const onInputMonitoringChange = jest.fn();
    const onAutomationModeChange = jest.fn();
    render(
      <TrackMixControls
        track={{
          ...track,
          type: 'voice_audio',
          instrumentId: 'voice_audio',
          presetId: 'voice_audio',
        }}
        onInputMonitoringChange={onInputMonitoringChange}
        onAutomationModeChange={onAutomationModeChange}
        onVolumeChange={jest.fn()}
        onPanChange={jest.fn()}
        onGainChange={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Input monitoring for Keys'));
    fireEvent.change(screen.getByLabelText('Automation mode for Keys'), {
      target: {value: 'touch'},
    });

    expect(onInputMonitoringChange).toHaveBeenCalledWith('track-keys', true);
    expect(onAutomationModeChange).toHaveBeenCalledWith('track-keys', 'touch');
  });

  it('dispatches automation point edits at the playhead', () => {
    const onAutomationPointSet = jest.fn();
    const onAutomationPointRemove = jest.fn();
    const onAutomationPointCapture = jest.fn();
    render(
      <TrackMixControls
        track={{
          ...track,
          automationMode: 'touch',
          automationLanes: [
            {targetType: 'track', parameterId: 'volumeDb', points: [{beat: 4, value: -6}]},
            {targetType: 'fx', parameterId: 'eq.dryWet', points: []},
          ],
        }}
        playheadBeat={4}
        onInputMonitoringChange={jest.fn()}
        onAutomationModeChange={jest.fn()}
        onAutomationPointSet={onAutomationPointSet}
        onAutomationPointRemove={onAutomationPointRemove}
        onAutomationPointCapture={onAutomationPointCapture}
        onVolumeChange={jest.fn()}
        onPanChange={jest.fn()}
        onGainChange={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Write Volume automation point for Keys'}));
    fireEvent.click(screen.getByRole('button', {name: 'Clear Volume automation point for Keys'}));
    fireEvent.change(screen.getByLabelText('Automation target for Keys'), {
      target: {value: 'fx:eq.dryWet'},
    });
    fireEvent.change(screen.getByLabelText('Automation value for Keys'), {target: {value: '0.75'}});
    fireEvent.click(screen.getByRole('button', {name: 'Write EQ Mix automation point for Keys'}));
    fireEvent.change(screen.getByLabelText('Automation target for Keys'), {
      target: {value: 'instrument:filter.cutoff'},
    });
    fireEvent.change(screen.getByLabelText('Automation value for Keys'), {target: {value: '0.42'}});
    fireEvent.click(
      screen.getByRole('button', {name: 'Write Instrument Cutoff automation point for Keys'}),
    );
    fireEvent.change(screen.getByLabelText('Automation target for Keys'), {
      target: {value: 'instrument:filter.resonance'},
    });
    fireEvent.change(screen.getByLabelText('Automation value for Keys'), {target: {value: '0.31'}});
    fireEvent.click(
      screen.getByRole('button', {name: 'Write Instrument Resonance automation point for Keys'}),
    );
    fireEvent.click(
      screen.getByRole('button', {name: 'Capture Instrument Resonance automation point for Keys'}),
    );

    expect(onAutomationPointSet).toHaveBeenCalledWith(
      'track-keys',
      'track',
      'volumeDb',
      4,
      -6,
    );
    expect(onAutomationPointSet).toHaveBeenCalledWith(
      'track-keys',
      'fx',
      'eq.dryWet',
      4,
      0.75,
    );
    expect(onAutomationPointSet).toHaveBeenCalledWith(
      'track-keys',
      'instrument',
      'filter.cutoff',
      4,
      0.42,
    );
    expect(onAutomationPointSet).toHaveBeenCalledWith(
      'track-keys',
      'instrument',
      'filter.resonance',
      4,
      0.31,
    );
    expect(onAutomationPointCapture).toHaveBeenCalledWith(
      'track-keys',
      'instrument',
      'filter.resonance',
      4,
    );
    expect(onAutomationPointRemove).toHaveBeenCalledWith(
      'track-keys',
      'track',
      'volumeDb',
      4,
    );
    expect(screen.getByRole('button', {name: 'Clear Instrument Resonance automation point for Keys'}))
      .toBeDisabled();
    expect(screen.getByLabelText('Automation point count for Keys')).toHaveTextContent('1 pts');
  });

  it('disables native capture while automation is in read mode', () => {
    render(
      <TrackMixControls
        track={track}
        playheadBeat={4}
        onInputMonitoringChange={jest.fn()}
        onAutomationModeChange={jest.fn()}
        onAutomationPointSet={jest.fn()}
        onAutomationPointRemove={jest.fn()}
        onAutomationPointCapture={jest.fn()}
        onVolumeChange={jest.fn()}
        onPanChange={jest.fn()}
        onGainChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', {name: 'Capture Volume automation point for Keys'}))
      .toBeDisabled();
  });

  it('captures touched volume and pan automation while playback is writing', () => {
    const onAutomationPointCapture = jest.fn();
    const onVolumeChange = jest.fn();
    const onPanChange = jest.fn();
    render(
      <TrackMixControls
        track={{...track, automationMode: 'latch'}}
        playheadBeat={6.25}
        isPlaying={true}
        onInputMonitoringChange={jest.fn()}
        onAutomationModeChange={jest.fn()}
        onAutomationPointSet={jest.fn()}
        onAutomationPointRemove={jest.fn()}
        onAutomationPointCapture={onAutomationPointCapture}
        onVolumeChange={onVolumeChange}
        onPanChange={onPanChange}
        onGainChange={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Volume for Keys'), {target: {value: '-10'}});
    fireEvent.change(screen.getByLabelText('Pan for Keys'), {target: {value: '-0.25'}});

    expect(onVolumeChange).toHaveBeenCalledWith('track-keys', -10);
    expect(onPanChange).toHaveBeenCalledWith('track-keys', -0.25);
    expect(onAutomationPointCapture).toHaveBeenCalledWith(
      'track-keys',
      'track',
      'volumeDb',
      6.25,
    );
    expect(onAutomationPointCapture).toHaveBeenCalledWith(
      'track-keys',
      'track',
      'pan',
      6.25,
    );
  });

  it('renders the native track meter state', () => {
    useMixMeterStore.getState().applySnapshot({
      schemaVersion: 1,
      source: 'tracktion_level_measurer',
      timestampMs: 1,
      input: {
        active: false,
        deviceName: '',
        peak: {db: -100, linear: 0},
        peakHold: {db: -100, linear: 0},
        clipping: false,
        channels: [],
      },
      master: {
        peak: {db: -100, linear: 0},
        peakHold: {db: -100, linear: 0},
        clipping: false,
        channels: [],
      },
      tracks: {
        'track-keys': {
          trackId: 'track-keys',
          name: 'Keys',
          peak: {db: -12, linear: 0.25},
          peakHold: {db: -6, linear: 0.5},
          clipping: true,
          channels: [],
        },
      },
    });

    render(
      <TrackMixControls
        track={track}
        onInputMonitoringChange={jest.fn()}
        onAutomationModeChange={jest.fn()}
        onVolumeChange={jest.fn()}
        onPanChange={jest.fn()}
        onGainChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('meter', {name: 'Native level meter for Keys'}))
      .toHaveAttribute('aria-valuenow', '-12');
  });
});
