import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

import {emptyTrackFxState, type TrackFxState} from '../src/native/fxContract';
import {TrackFxPanel} from '../src/web/components/fx/TrackFxPanel';

const sendCommand = jest.fn();

function installFxMock(nativeState?: TrackFxState) {
  const state = nativeState ?? emptyTrackFxState('track-1');
  sendCommand.mockImplementation((command: string, payloadJson?: string) => {
    if (command === 'get_track_fx') {
      return JSON.stringify({ok: true, data: state});
    }
    if (command === 'list_fx_plugins') {
      return JSON.stringify({
        ok: true,
        data: {
          catalogVersion: 1,
          externalPluginHosting: 'disabled',
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
          externalPluginHosting: 'scan_metadata_only',
          defaultPathsUsed: true,
          recursive: true,
          truncated: false,
          scannedPaths: [{path: '/Library/Audio/Plug-Ins/VST3', status: 'scanned'}],
          formatCounts: {external_au: 1, external_vst3: 1},
          candidates: [
            {
              pluginId: 'external_vst3:/Library/Audio/Plug-Ins/VST3/Shape.vst3',
              displayName: 'Shape',
              format: 'external_vst3',
              path: '/Library/Audio/Plug-Ins/VST3/Shape.vst3',
              status: 'disabled',
            },
            {
              pluginId: 'external_au:/Library/Audio/Plug-Ins/Components/Tone.component',
              displayName: 'Tone',
              format: 'external_au',
              path: '/Library/Audio/Plug-Ins/Components/Tone.component',
              status: 'disabled',
            },
          ],
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

test('shows empty state without a track', () => {
  render(<TrackFxPanel trackId={null} />);
  expect(screen.getByText(/Select a track to edit EQ/i)).toBeInTheDocument();
});

test('loads FX chain and toggles EQ via set_track_fx', async () => {
  installFxMock();
  render(<TrackFxPanel trackId="track-1" trackName="Keys" />);

  await waitFor(() => {
    expect(screen.getAllByText('Parametric').length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getByRole('button', {name: 'Parametric off'}));

  await waitFor(() => {
    expect(sendCommand).toHaveBeenCalledWith(
      'set_track_fx',
      expect.stringContaining('"slot":"eq"'),
    );
  });

  const setPayload = JSON.parse(
    sendCommand.mock.calls.find(([cmd]) => cmd === 'set_track_fx')?.[1] ?? '{}',
  ) as TrackFxState;
  expect(setPayload.slots).toHaveLength(3);
  expect(setPayload.slots.map(slot => slot.slot)).toEqual(['eq', 'compressor', 'reverb']);
  expect(setPayload.slots[0].params.pluginId).toBe('airwindows:Parametric');
  expect(setPayload.pluginChain?.map(slot => slot.slot)).toEqual(['eq', 'compressor', 'reverb']);
});

test('adds a managed plugin from the native catalog', async () => {
  installFxMock();
  render(<TrackFxPanel trackId="track-1" trackName="Keys" />);

  fireEvent.click(await screen.findByRole('button', {name: /Add MatrixVerb/i}));

  await waitFor(() => {
    expect(sendCommand.mock.calls.filter(([cmd]) => cmd === 'set_track_fx').length).toBeGreaterThan(0);
  });

  const setPayload = JSON.parse(
    sendCommand.mock.calls.find(([cmd]) => cmd === 'set_track_fx')?.[1] ?? '{}',
  ) as TrackFxState;
  expect(setPayload.slots.find(slot => slot.slot === 'reverb')?.enabled).toBe(true);
  expect(setPayload.pluginChain?.find(slot => slot.slot === 'reverb')).toMatchObject({
    enabled: true,
    bypassed: false,
  });
});

test('removes a managed plugin from the chain without losing params', async () => {
  const state = emptyTrackFxState('track-1');
  state.slots[0].enabled = true;
  state.pluginChain![0].enabled = true;
  state.pluginChain![0].bypassed = false;
  installFxMock(state);
  render(<TrackFxPanel trackId="track-1" trackName="Keys" />);

  fireEvent.click(await screen.findByRole('button', {name: 'Remove Parametric'}));

  await waitFor(() => {
    expect(sendCommand.mock.calls.filter(([cmd]) => cmd === 'set_track_fx').length).toBeGreaterThan(0);
  });

  const setPayload = JSON.parse(
    sendCommand.mock.calls.find(([cmd]) => cmd === 'set_track_fx')?.[1] ?? '{}',
  ) as TrackFxState;
  expect(setPayload.slots.find(slot => slot.slot === 'eq')?.enabled).toBe(false);
  expect(setPayload.slots.find(slot => slot.slot === 'eq')?.params.pluginId).toBe('airwindows:Parametric');
  expect(setPayload.pluginChain?.find(slot => slot.slot === 'eq')).toMatchObject({
    enabled: false,
    bypassed: true,
  });
});

test('commits plugin-chain reorder metadata through set_track_fx', async () => {
  installFxMock();
  render(<TrackFxPanel trackId="track-1" trackName="Keys" />);

  await waitFor(() => {
    expect(screen.getByRole('button', {name: 'Move MatrixVerb earlier'})).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', {name: 'Move MatrixVerb earlier'}));

  await waitFor(() => {
    expect(sendCommand.mock.calls.filter(([cmd]) => cmd === 'set_track_fx').length).toBeGreaterThan(0);
  });

  const setPayload = JSON.parse(
    sendCommand.mock.calls.find(([cmd]) => cmd === 'set_track_fx')?.[1] ?? '{}',
  ) as TrackFxState;
  expect(setPayload.slots.map(slot => slot.slot)).toEqual(['eq', 'compressor', 'reverb']);
  expect(setPayload.pluginChain?.map(slot => slot.slot)).toEqual(['eq', 'reverb', 'compressor']);
});

test('scans external plugins from the FX panel without adding JS audio processing', async () => {
  installFxMock();
  render(<TrackFxPanel trackId="track-1" trackName="Keys" />);

  fireEvent.click(await screen.findByRole('button', {name: 'Scan'}));

  await waitFor(() => {
    expect(sendCommand).toHaveBeenCalledWith(
      'scan_fx_plugins',
      expect.stringContaining('"paths":[]'),
    );
  });
  expect(screen.getByText('Shape')).toBeInTheDocument();
  expect(screen.getByText('Tone')).toBeInTheDocument();
  expect(screen.getByText(/1 VST3 · 1 AU/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Host off/i)).toHaveLength(2);
});

test('commits parameter changes on pointer release, not during drag', async () => {
  installFxMock();
  render(<TrackFxPanel trackId="track-1" trackName="Keys" />);

  await waitFor(() => {
    expect(document.querySelectorAll('.fx-param-fader').length).toBeGreaterThan(0);
  });

  const setCallsBefore = sendCommand.mock.calls.filter(([cmd]) => cmd === 'set_track_fx').length;
  const fader = document.querySelector('.fx-param-fader');
  expect(fader).toBeTruthy();

  fireEvent.mouseDown(fader!, {clientY: 80, buttons: 1});
  fireEvent.mouseMove(fader!, {clientY: 40, buttons: 1});

  const setCallsDuring = sendCommand.mock.calls.filter(([cmd]) => cmd === 'set_track_fx').length;
  expect(setCallsDuring).toBe(setCallsBefore);

  fireEvent.mouseUp(fader!, {clientY: 40});

  await waitFor(() => {
    expect(sendCommand.mock.calls.filter(([cmd]) => cmd === 'set_track_fx').length).toBeGreaterThan(
      setCallsBefore,
    );
  });
});

test('captures FX automation when committing during playback write modes', async () => {
  const onAutomationPointCapture = jest.fn();
  installFxMock();
  render(
    <TrackFxPanel
      trackId="track-1"
      trackName="Keys"
      automationMode="touch"
      isPlaying={true}
      playheadBeat={7.5}
      onAutomationPointCapture={onAutomationPointCapture}
    />,
  );

  const treble = await screen.findByRole('slider', {name: 'Treble'});
  fireEvent.change(treble, {target: {value: '0.72'}});
  fireEvent.blur(treble);

  await waitFor(() => {
    expect(onAutomationPointCapture).toHaveBeenCalledWith(
      'track-1',
      'fx',
      'eq.treble',
      7.5,
    );
  });
});

test('does not capture FX automation in read mode', async () => {
  const onAutomationPointCapture = jest.fn();
  installFxMock();
  render(
    <TrackFxPanel
      trackId="track-1"
      trackName="Keys"
      automationMode="read"
      isPlaying={true}
      playheadBeat={7.5}
      onAutomationPointCapture={onAutomationPointCapture}
    />,
  );

  const treble = await screen.findByRole('slider', {name: 'Treble'});
  fireEvent.change(treble, {target: {value: '0.72'}});
  fireEvent.blur(treble);

  await waitFor(() => {
    expect(sendCommand.mock.calls.filter(([cmd]) => cmd === 'set_track_fx')).toHaveLength(1);
  });
  expect(onAutomationPointCapture).not.toHaveBeenCalled();
});

test('previews AI FX targets without silently committing to native', async () => {
  installFxMock();
  render(
    <TrackFxPanel
      trackId="track-1"
      trackName="Keys"
      aiTargets={[{
        trackId: 'track-1',
        slot: 'eq',
        pluginId: 'airwindows:Parametric',
        values: {treble: 0.72},
      }]}
    />,
  );

  await waitFor(() => {
    expect(screen.getByText('72%')).toBeInTheDocument();
  });

  expect(document.querySelector('.fx-param.ai-targeted')).toBeTruthy();
  expect(document.querySelector('.fx-slot-card.ai-targeted')).toBeTruthy();
  expect(sendCommand.mock.calls.filter(([cmd]) => cmd === 'set_track_fx')).toHaveLength(0);
});
