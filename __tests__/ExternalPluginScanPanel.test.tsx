import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

import {ExternalPluginScanPanel} from '../src/web/components/fx/ExternalPluginScanPanel';

const sendCommand = jest.fn();

beforeEach(() => {
  sendCommand.mockImplementation((command: string) => {
    if (command === 'scan_fx_plugins') {
      return JSON.stringify({
        ok: true,
        data: {
          scanVersion: 1,
          externalPluginHosting: 'scan_metadata_only',
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
            status: 'disabled',
          }],
        },
      });
    }
    if (command === 'probe_fx_plugin') {
      return JSON.stringify({
        ok: false,
        error: {code: 'external_plugin_hosting_disabled', message: 'External VST3 plugin hosting is disabled.'},
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  window.audioEngine = {sendCommand};
});

afterEach(() => {
  sendCommand.mockReset();
});

test('probes a scanned external plugin candidate without adding it to the chain', async () => {
  render(<ExternalPluginScanPanel />);

  fireEvent.click(screen.getByRole('button', {name: 'Scan'}));
  await screen.findByText('Shape');

  fireEvent.click(screen.getByRole('button', {name: 'Probe'}));

  await waitFor(() => {
    expect(sendCommand).toHaveBeenCalledWith(
      'probe_fx_plugin',
      JSON.stringify({path: '/plugins/Shape.vst3', format: 'external_vst3', instantiate: false}),
    );
  });
  expect(screen.getByText('External VST3 plugin hosting is disabled.')).toBeInTheDocument();
  expect(sendCommand.mock.calls.some(([command]) => command === 'set_track_fx')).toBe(false);
});
