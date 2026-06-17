import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';
import {syncTempoMapToEngine} from '../src/native/refreshPlayback';
import {buildNativeTempoMapPayload} from '../src/native/tempoMapPayload';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => '{"ok":true}'),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;

describe('native tempo map payload', () => {
  beforeEach(() => mockedSend.mockClear());

  it('normalizes tempo and meter maps for the native bridge', () => {
    expect(buildNativeTempoMapPayload({
      bpm: 999,
      timeSignature: {numerator: 13, denominator: 5},
      tempoMap: [
        {id: 'late', beat: 8.1234, bpm: 10, ramp: 'linear'},
      ],
      meterMap: [
        {id: 'meter', beat: 12, timeSignature: {numerator: 7, denominator: 8}},
      ],
    })).toEqual({
      bpm: 300,
      timeSignature: {...DEFAULT_TIME_SIGNATURE},
      tempoMap: [{id: 'late', beat: 8.123, bpm: 20, ramp: 'linear'}],
      meterMap: [{id: 'meter', beat: 12, timeSignature: {numerator: 7, denominator: 8}}],
    });
  });

  it('syncs the current project tempo map through the native command', () => {
    useDAWStore.setState({
      bpm: 128,
      timeSignature: {numerator: 3, denominator: 4},
      tempoMap: [{id: 'tempo-four', beat: 4, bpm: 140, ramp: 'jump'}],
      meterMap: [{id: 'meter-eight', beat: 8, timeSignature: {numerator: 7, denominator: 8}}],
    });

    syncTempoMapToEngine();

    expect(mockedSend).toHaveBeenCalledWith('set_tempo_map', {
      bpm: 128,
      timeSignature: {numerator: 3, denominator: 4},
      tempoMap: [{id: 'tempo-four', beat: 4, bpm: 140, ramp: 'jump'}],
      meterMap: [{id: 'meter-eight', beat: 8, timeSignature: {numerator: 7, denominator: 8}}],
    });
  });
});
