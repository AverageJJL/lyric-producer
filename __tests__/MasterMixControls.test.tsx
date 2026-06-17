import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import {useMixMeterStore} from '../src/store/mixMeterStore';
import {MasterMixControls} from '../src/web/components/MasterMixControls';

describe('MasterMixControls', () => {
  beforeEach(() => useMixMeterStore.getState().clear());

  it('dispatches master volume and pan edits', () => {
    const onVolumeChange = jest.fn();
    const onPanChange = jest.fn();

    render(
      <MasterMixControls
        volumeDb={-6}
        pan={0.25}
        onVolumeChange={onVolumeChange}
        onPanChange={onPanChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Master volume'), {target: {value: '-12'}});
    fireEvent.change(screen.getByLabelText('Master pan'), {target: {value: '-0.5'}});

    expect(onVolumeChange).toHaveBeenCalledWith(-12);
    expect(onPanChange).toHaveBeenCalledWith(-0.5);
  });

  it('renders the native master meter state', () => {
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
        peak: {db: -7, linear: 0.45},
        peakHold: {db: -2, linear: 0.8},
        clipping: false,
        channels: [],
      },
      tracks: {},
    });

    render(
      <MasterMixControls
        volumeDb={-6}
        pan={0.25}
        onVolumeChange={jest.fn()}
        onPanChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('meter', {name: 'Native master level meter'}))
      .toHaveAttribute('aria-valuenow', '-7');
  });
});
