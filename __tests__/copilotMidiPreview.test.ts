import {
  activeCopilotMidiPreviewOptionId,
  startCopilotMidiOptionPreview,
  stopCopilotMidiOptionPreview,
} from '../src/assistant/copilotMidiPreview';
import type {CopilotMidiOption} from '../src/assistant/copilotMidiOptions';
import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';
import {useDAWStore} from '../src/store/useDAWStore';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(),
}));

jest.mock('../src/native/syncTrackInstruments', () => ({
  syncTrackInstruments: jest.fn(),
  syncTrackInstrumentToEngine: jest.fn(),
}));

const sendCommand = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;

function okResponse(): string {
  return JSON.stringify({ok: true, data: {}});
}

function option(id: string): CopilotMidiOption {
  return {
    id,
    label: `Bass ${id}`,
    role: 'bassline',
    description: 'Preview lifecycle test.',
    startBeat: 0,
    lengthBeats: 4,
    target: {instrumentId: 'bass_growly', presetId: 'growly_bass_lite', label: 'Electric Bass'},
    createTrack: {name: 'Electric Bass', instrumentId: 'bass_growly', presetId: 'growly_bass_lite'},
    notes: [{note: 40, velocity: 100, startBeat: 0, lengthBeats: 1}],
  };
}

beforeEach(() => {
  useDAWStore.setState({tracks: [], blocks: []});
  sendCommand.mockReturnValue(okResponse());
});

afterEach(() => {
  sendCommand.mockReturnValue(okResponse());
  stopCopilotMidiOptionPreview();
  sendCommand.mockReset();
});

describe('Copilot MIDI option preview lifecycle', () => {
  it('stops the active phrase preview before starting another option', () => {
    expect(startCopilotMidiOptionPreview(option('a'))).toEqual({ok: true});
    expect(startCopilotMidiOptionPreview(option('b'))).toEqual({ok: true});

    expect(sendCommand.mock.calls.map(call => call[0])).toEqual([
      'setTracks',
      'start_midi_phrase_preview',
      'stop_midi_phrase_preview',
      'setTracks',
      'setTracks',
      'start_midi_phrase_preview',
    ]);
    expect(activeCopilotMidiPreviewOptionId()).toBe('b');
  });

  it('stops native phrase preview and restores tracks when start fails', () => {
    sendCommand.mockImplementation(command =>
      command === 'start_midi_phrase_preview'
        ? JSON.stringify({ok: false, error: {code: 'track_not_found'}})
        : okResponse(),
    );

    expect(startCopilotMidiOptionPreview(option('broken'))).toEqual({
      ok: false,
      error: 'MIDI preview could not start.',
    });

    expect(sendCommand.mock.calls.map(call => call[0])).toEqual([
      'setTracks',
      'start_midi_phrase_preview',
      'stop_midi_phrase_preview',
      'setTracks',
    ]);
    expect(activeCopilotMidiPreviewOptionId()).toBeNull();
  });
});
