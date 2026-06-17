import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';
import type {DAWTrack} from '../src/store/useDAWStore';
import {InstrumentControlPanel} from '../src/web/components/InstrumentControlPanel';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;

const fourOscTrack: DAWTrack = {
  id: 'track-lead',
  name: 'Lead',
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isMuted: false,
  isSolo: false,
  isRecordArmed: false,
  isLocked: false,
  automationMode: 'touch',
};

describe('InstrumentControlPanel', () => {
  beforeEach(() => {
    mockedSend.mockReset();
    mockedSend.mockImplementation((command, payload) => JSON.stringify({
      ok: true,
      data: {
        trackId: (payload as {trackId?: string}).trackId,
        targetType: 'instrument',
        parameterId: (payload as {parameterId?: string}).parameterId,
        value: (payload as {value?: number}).value,
      },
    }));
  });

  it('sets FourOsc filter values and captures automation while playback is writing', () => {
    const onAutomationPointCapture = jest.fn();
    render(
      <InstrumentControlPanel
        track={fourOscTrack}
        isPlaying={true}
        playheadBeat={9.25}
        onAutomationPointCapture={onAutomationPointCapture}
      />,
    );

    fireEvent.change(screen.getByLabelText('Instrument cutoff'), {target: {value: '0.42'}});

    expect(mockedSend).toHaveBeenCalledWith('set_track_instrument_param', {
      trackId: 'track-lead',
      parameterId: 'filter.cutoff',
      value: 0.42,
    });
    expect(onAutomationPointCapture).toHaveBeenCalledWith(
      'track-lead',
      'instrument',
      'filter.cutoff',
      9.25,
    );
  });

  it('does not capture automation in read mode', () => {
    const onAutomationPointCapture = jest.fn();
    render(
      <InstrumentControlPanel
        track={{...fourOscTrack, automationMode: 'read'}}
        isPlaying={true}
        playheadBeat={9.25}
        onAutomationPointCapture={onAutomationPointCapture}
      />,
    );

    fireEvent.change(screen.getByLabelText('Instrument resonance'), {target: {value: '0.35'}});

    expect(mockedSend).toHaveBeenCalledWith('set_track_instrument_param', {
      trackId: 'track-lead',
      parameterId: 'filter.resonance',
      value: 0.35,
    });
    expect(onAutomationPointCapture).not.toHaveBeenCalled();
  });

  it('hides controls for sample-backed instruments', () => {
    render(
      <InstrumentControlPanel
        track={{
          ...fourOscTrack,
          instrumentId: 'keys_piano',
          presetId: 'splendid_grand_lite',
        }}
      />,
    );

    expect(screen.queryByLabelText('Instrument controls')).not.toBeInTheDocument();
  });
});
