import React from 'react';
import {act, cleanup, render, screen} from '@testing-library/react';

import {useMixMeterStore} from '../src/store/mixMeterStore';
import type {DAWTrack} from '../src/store/useDAWStore';
import {MixerDock} from '../src/web/components/MixerDock';

const sendCommand = jest.fn();

const track: DAWTrack = {
  id: 'track-keys',
  name: 'Keys',
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'init',
  isRecordArmed: false,
  isLocked: false,
  volumeDb: -3,
  pan: 0,
};

function renderMixerDock() {
  const noop = jest.fn();
  return render(
    <MixerDock
      tracks={[track]}
      masterVolumeDb={0}
      masterPan={0}
      fxRefreshKey={0}
      onClose={noop}
      onMasterVolumeChange={noop}
      onMasterPanChange={noop}
      onTrackVolumeChange={noop}
      onTrackPanChange={noop}
      onToggleMute={noop}
      onToggleSolo={noop}
      onOpenFx={noop}
    />,
  );
}

beforeEach(() => {
  useMixMeterStore.getState().clear();
  sendCommand.mockImplementation((command: string) => {
    if (command === 'get_track_fx') {
      return JSON.stringify({ok: false, error: 'No native FX in test'});
    }
    return JSON.stringify({ok: true, data: {}});
  });
  window.audioEngine = {sendCommand};
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  delete window.audioEngine;
});

test('meter ticks do not refresh mixer FX summaries', () => {
  renderMixerDock();
  expect(sendCommand.mock.calls.filter(([command]) => command === 'get_track_fx'))
    .toHaveLength(1);

  act(() => {
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
        peak: {db: -12, linear: 0.2},
        peakHold: {db: -8, linear: 0.4},
        clipping: false,
        channels: [],
      },
      tracks: {
        [track.id]: {
          trackId: track.id,
          name: track.name,
          peak: {db: -7, linear: 0.45},
          peakHold: {db: -2, linear: 0.8},
          clipping: false,
          channels: [],
        },
      },
    });
  });

  expect(screen.getByRole('meter', {name: 'Keys level'}))
    .toHaveAttribute('aria-valuenow', '-7');
  expect(sendCommand.mock.calls.filter(([command]) => command === 'get_track_fx'))
    .toHaveLength(1);
});
