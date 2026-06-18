import {
  exportCurrentMidi,
  exportProjectStems,
} from '../src/arrangement/projectExportActions';
import type {ProjectFileBridge} from '../src/native/projectFileApi';
import {useDAWStore} from '../src/store/useDAWStore';

const sendCommand = jest.fn();
const exportStems = jest.fn();
const writeMidiFile = jest.fn();

function bridge(): ProjectFileBridge {
  return {
    saveProjectFolder: jest.fn(),
    openProjectFolder: jest.fn(),
    setProjectAssetRoot: jest.fn(),
    exportMixdown: jest.fn(),
    exportStems,
    writeMidiFile,
  };
}

beforeEach(() => {
  const renderPaths = new Map<string, string>();
  sendCommand.mockImplementation((command: string, payloadJson: string) => {
    const payload = JSON.parse(payloadJson || '{}') as {requestId?: string; path?: string};
    if (command === 'render_mixdown_async') {
      renderPaths.set(payload.requestId ?? '', payload.path ?? '/tmp/render.wav');
      return JSON.stringify({ok: true, data: {status: 'started', requestId: payload.requestId}});
    }
    if (command === 'get_render_mixdown_status') {
      return JSON.stringify({
        ok: true,
        data: {status: 'completed', path: renderPaths.get(payload.requestId ?? '') ?? '/tmp/render.wav'},
      });
    }
    return JSON.stringify({ok: true, data: {path: '/tmp/render.wav'}});
  });
  window.audioEngine = {sendCommand};
  exportStems.mockImplementation(async request => ({
    ok: true,
    directoryPath: '/tmp/stems',
    stems: request.tracks.map((track: {trackId: string}) => ({
      trackId: track.trackId,
      path: `/tmp/stems/${track.trackId}.wav`,
    })),
  }));
  writeMidiFile.mockResolvedValue({ok: true, path: '/tmp/arrangement.mid'});
  useDAWStore.setState({
    tracks: [],
    blocks: [],
    patterns: {},
    selectedBlockId: null,
    selectedBlockIds: [],
  });
});

afterEach(() => {
  sendCommand.mockReset();
  exportStems.mockReset();
  writeMidiFile.mockReset();
  delete window.audioEngine;
});

describe('project export progress', () => {
  it('reports per-stem render progress', async () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    useDAWStore.getState().addTrackFromTemplate('drum_machine');
    const messages: string[] = [];

    await expect(exportProjectStems(bridge(), {
      onProgress: progress => messages.push(progress.message),
    })).resolves.toEqual(expect.objectContaining({ok: true}));

    expect(messages).toEqual([
      'Choosing stem export folder',
      'Rendering stem 1/2: Grand Piano',
      'Rendered stem 1/2',
      'Rendering stem 2/2: Pop Basic',
      'Rendered stem 2/2',
    ]);
  });

  it('reports MIDI preparation and write phases', async () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;
    useDAWStore.setState({
      blocks: [{
        id: 'clip-midi',
        trackId,
        name: 'Lead',
        startBeat: 0,
        lengthBeats: 1,
        type: 'midi',
        color: '#4a7fd4',
        notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
      }],
    });
    const messages: string[] = [];

    await expect(exportCurrentMidi(bridge(), 'all', {
      onProgress: progress => messages.push(progress.message),
    })).resolves.toEqual({ok: true, path: '/tmp/arrangement.mid'});

    expect(messages).toEqual(['Preparing MIDI export', 'Writing MIDI file']);
  });
});
