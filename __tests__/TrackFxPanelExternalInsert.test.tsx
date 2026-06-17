import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

import {emptyTrackFxState, type TrackFxState} from '../src/native/fxContract';
import {TrackFxPanel} from '../src/web/components/fx/TrackFxPanel';

const sendCommand = jest.fn();

function installExternalHostMock(options: {canInsert: boolean; message?: string}) {
  const state = emptyTrackFxState('track-1');
  sendCommand.mockImplementation((command: string, payloadJson?: string) => {
    if (command === 'get_track_fx') {
      return JSON.stringify({ok: true, data: state});
    }
    if (command === 'list_fx_plugins') {
      return JSON.stringify({
        ok: true,
        data: {
          catalogVersion: 1,
          externalPluginHosting: 'enabled',
          formats: [
            {format: 'builtin_airwindows', enabled: true},
            {format: 'external_vst3', enabled: true},
          ],
          plugins: state.pluginChain?.map(slot => ({
            slot: slot.slot,
            pluginId: slot.pluginId,
            displayName: slot.displayName,
            format: slot.format,
            status: slot.status,
            params: [],
          })),
        },
      });
    }
    if (command === 'scan_fx_plugins') {
      return JSON.stringify({
        ok: true,
        data: {
          scanVersion: 1,
          externalPluginHosting: 'enabled',
          defaultPathsUsed: true,
          recursive: true,
          truncated: false,
          scannedPaths: [{path: '/plugins', status: 'scanned'}],
          formatCounts: {external_au: 0, external_vst3: 1},
          candidates: [{
            pluginId: 'external_vst3:/plugins/Shape.vst3',
            displayName: 'Shape',
            format: 'external_vst3',
            path: '/plugins/Shape.vst3',
            status: 'available',
          }],
        },
      });
    }
    if (command === 'validate_fx_plugin_insert') {
      const request = JSON.parse(payloadJson ?? '{}');
      return JSON.stringify({
        ok: true,
        data: {
          insertValidationVersion: 1,
          trackId: request.trackId,
          slot: request.slot,
          candidate: request.candidate,
          externalPluginHosting: 'enabled',
          canInsert: options.canInsert,
          requiresProbe: true,
          status: options.canInsert ? 'available' : 'disabled',
          reason: options.canInsert ? 'ready' : 'plugin_description_not_found',
          recoveryHint: options.message,
        },
      });
    }
    if (command === 'set_track_fx') {
      const payload = JSON.parse(payloadJson ?? '{}') as TrackFxState;
      return JSON.stringify({ok: true, data: payload});
    }
    return JSON.stringify({ok: true, data: {}});
  });
  window.audioEngine = {sendCommand};
}

beforeEach(() => {
  sendCommand.mockReset();
});

test('validates and commits an available external plugin candidate', async () => {
  installExternalHostMock({canInsert: true});
  render(<TrackFxPanel trackId="track-1" trackName="Keys" />);

  fireEvent.click(await screen.findByRole('button', {name: 'Scan'}));
  await screen.findByText('Shape');
  fireEvent.change(screen.getByRole('combobox', {name: 'Insert slot for Shape'}), {
    target: {value: 'compressor'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Insert Shape'}));

  await waitFor(() => {
    expect(sendCommand.mock.calls.some(([cmd]) => cmd === 'set_track_fx')).toBe(true);
  });
  expect(sendCommand).toHaveBeenCalledWith(
    'validate_fx_plugin_insert',
    expect.stringContaining('"slot":"compressor"'),
  );

  const setPayload = JSON.parse(
    sendCommand.mock.calls.find(([cmd]) => cmd === 'set_track_fx')?.[1] ?? '{}',
  ) as TrackFxState;
  expect(setPayload.slots.find(slot => slot.slot === 'compressor')?.enabled).toBe(true);
  expect(setPayload.pluginChain?.find(slot => slot.slot === 'compressor')).toMatchObject({
    pluginId: 'external_vst3:/plugins/Shape.vst3',
    displayName: 'Shape',
    format: 'external_vst3',
    enabled: true,
    bypassed: false,
    status: 'available',
  });
});

test('shows validation failure instead of committing an unavailable external plugin', async () => {
  installExternalHostMock({canInsert: false, message: 'No plugin descriptions found.'});
  render(<TrackFxPanel trackId="track-1" trackName="Keys" />);

  fireEvent.click(await screen.findByRole('button', {name: 'Scan'}));
  await screen.findByText('Shape');
  fireEvent.click(screen.getByRole('button', {name: 'Insert Shape'}));

  await screen.findByText('No plugin descriptions found.');
  expect(sendCommand.mock.calls.some(([command]) => command === 'set_track_fx')).toBe(false);
});
