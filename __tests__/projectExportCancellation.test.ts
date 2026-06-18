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
  sendCommand.mockReturnValue(JSON.stringify({ok: true, data: {path: '/tmp/render.wav'}}));
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

describe('project export cancellation', () => {
  it('stops MIDI export before writing the destination file', async () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;
    const controller = new AbortController();
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

    controller.abort();

    await expect(exportCurrentMidi(bridge(), 'all', {
      abortSignal: controller.signal,
    })).resolves.toEqual({ok: false, canceled: true, error: 'Export canceled.'});
    expect(writeMidiFile).not.toHaveBeenCalled();
  });

  it('requests native cancellation during an active stem render', async () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    useDAWStore.getState().addTrackFromTemplate('drum_machine');
    const controller = new AbortController();
    sendCommand.mockImplementation((command: string) => {
      if (command === 'render_mixdown_async') {
        controller.abort();
        return JSON.stringify({ok: true, data: {requestId: 'render-1', status: 'running'}});
      }
      if (command === 'cancel_render_mixdown') {
        return JSON.stringify({ok: true, data: {requestId: 'render-1', status: 'canceling'}});
      }
      if (command === 'get_render_mixdown_status') {
        return JSON.stringify({ok: true, data: {requestId: 'render-1', status: 'canceled'}});
      }
      return JSON.stringify({ok: true, data: {path: '/tmp/stems/first.wav'}});
    });

    await expect(exportProjectStems(bridge(), {
      abortSignal: controller.signal,
    })).resolves.toEqual({ok: false, canceled: true, error: 'Export canceled.'});
    expect(sendCommand.mock.calls.filter(([command]) => command === 'render_mixdown_async'))
      .toHaveLength(1);
    expect(sendCommand.mock.calls.filter(([command]) => command === 'cancel_render_mixdown'))
      .toHaveLength(1);
  });
});
