import {
  importCopilotMidiOption,
  type CopilotMidiOption,
} from '../src/assistant/copilotMidiOptions';
import {KEYS_PIANO} from '../src/music/instruments';
import {createTrackFromTemplate} from '../src/music/trackTemplates';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWTrack} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function resetStore(tracks: DAWTrack[] = []): void {
  useDAWStore.setState({
    bpm: 120,
    tracks,
    blocks: [],
    patterns: {},
    selectedTrackId: tracks[0]?.id ?? null,
    selectedBlockId: null,
    selectedBlockIds: [],
    playheadBeat: 0,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    syncSource: 'ui',
  });
}

const bassOption: CopilotMidiOption = {
  id: 'bass-a',
  label: 'Root Push',
  role: 'bassline',
  description: 'Root motion.',
  startBeat: 0,
  lengthBeats: 4,
  target: {instrumentId: 'bass_growly', presetId: 'growly_bass_lite', label: 'Electric Bass'},
  createTrack: {name: 'Electric Bass', instrumentId: 'bass_growly', presetId: 'growly_bass_lite'},
  notes: [{note: 40, velocity: 100, startBeat: 0, lengthBeats: 1}],
};

describe('Copilot MIDI options', () => {
  it('creates and selects a bass track when the selected track is not suitable', () => {
    const piano = createTrackFromTemplate('virtual_instrument', 0, {
      id: 'track-piano',
      instrumentId: KEYS_PIANO.id,
      presetId: KEYS_PIANO.defaultPresetId,
    });
    resetStore([piano]);

    const result = importCopilotMidiOption(bassOption);
    const state = useDAWStore.getState();

    expect(result).toMatchObject({ok: true, trackId: 'copilot-track-bass-a'});
    expect(state.tracks.find(track => track.id === 'copilot-track-bass-a')).toMatchObject({
      type: 'software_instrument',
      instrumentId: 'bass_growly',
    });
    expect(state.selectedTrackId).toBe('copilot-track-bass-a');
    expect(state.blocks[0]).toMatchObject({trackId: 'copilot-track-bass-a', startBeat: 0});
  });

  it('imports repeat clicks after the prior imported option', () => {
    resetStore();

    expect(importCopilotMidiOption(bassOption)).toMatchObject({ok: true, startBeat: 0});
    expect(importCopilotMidiOption(bassOption)).toMatchObject({ok: true, startBeat: 4});
  });

  it('rejects drag drops on non-software-instrument tracks', () => {
    const audio = createTrackFromTemplate('voice_audio', 0, {id: 'track-audio'});
    resetStore([audio]);

    expect(importCopilotMidiOption(bassOption, {trackId: 'track-audio', startBeat: 2}))
      .toMatchObject({ok: false});
  });
});
