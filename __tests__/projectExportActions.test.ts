import {
  exportCurrentMixdown,
  exportCurrentMidi,
  exportCycleRangeMixdown,
  exportProjectStems,
  exportSelectedClipRender,
} from '../src/arrangement/projectExportActions';
import type {ProjectFileBridge} from '../src/native/projectFileApi';
import {useDAWStore} from '../src/store/useDAWStore';

const sendCommand = jest.fn();
const exportMixdown = jest.fn();
const exportStems = jest.fn();
const writeMidiFile = jest.fn();

function bridge(): ProjectFileBridge {
  return {
    saveProjectFolder: jest.fn(),
    openProjectFolder: jest.fn(),
    setProjectAssetRoot: jest.fn(),
    exportMixdown,
    exportStems,
    writeMidiFile,
  };
}

function renderMixdownPayloads() {
  return sendCommand.mock.calls
    .filter(([command]) => command === 'render_mixdown_async')
    .map(([, payload]) => {
      const {requestId, ...renderPayload} = JSON.parse(payload);
      void requestId;
      return renderPayload;
    });
}

beforeEach(() => {
  exportMixdown.mockResolvedValue({ok: true, path: '/tmp/mix.wav'});
  writeMidiFile.mockResolvedValue({ok: true, path: '/tmp/arrangement.mid'});
  exportStems.mockImplementation(async request => ({
    ok: true,
    directoryPath: '/tmp/stems',
    stems: request.tracks.map((track: {trackId: string}) => ({
      trackId: track.trackId,
      path: `/tmp/stems/${track.trackId}.wav`,
    })),
  }));
  sendCommand.mockImplementation((command: string) => {
    if (command === 'render_mixdown_async') {
      return JSON.stringify({ok: true, data: {status: 'running'}});
    }
    if (command === 'get_render_mixdown_status') {
      return JSON.stringify({ok: true, data: {status: 'completed', path: '/tmp/mix.wav'}});
    }
    return JSON.stringify({ok: true, data: {path: '/tmp/mix.wav'}});
  });
  window.audioEngine = {sendCommand};
  useDAWStore.setState({
    tracks: [],
    blocks: [],
    patterns: {},
    selectedBlockId: null,
    selectedBlockIds: [],
    isCycleEnabled: false,
    cycleStartBeat: 0,
    cycleEndBeat: 4,
  });
});

afterEach(() => {
  exportMixdown.mockReset();
  exportStems.mockReset();
  writeMidiFile.mockReset();
  sendCommand.mockReset();
  delete window.audioEngine;
});

describe('project export actions', () => {
  it('exports the full mixdown with an async native payload', async () => {
    await expect(exportCurrentMixdown(bridge())).resolves.toEqual({
      ok: true,
      path: '/tmp/mix.wav',
    });

    expect(exportMixdown).toHaveBeenCalledWith();
    expect(renderMixdownPayloads()).toEqual([{path: '/tmp/mix.wav'}]);
  });

  it('exports the enabled cycle range as a native beat range render', async () => {
    useDAWStore.setState({isCycleEnabled: true, cycleStartBeat: 2, cycleEndBeat: 6});

    await expect(exportCycleRangeMixdown(bridge())).resolves.toEqual({
      ok: true,
      path: '/tmp/mix.wav',
    });

    expect(exportMixdown).toHaveBeenCalledWith({
      title: 'Export Cycle Range',
      defaultPath: 'Cycle Mixdown.wav',
    });
    expect(renderMixdownPayloads()).toEqual([
      {path: '/tmp/mix.wav', startBeat: 2, endBeat: 6, tailBeats: 2},
    ]);
  });

  it('does not export a range when Cycle is disabled', async () => {
    await expect(exportCycleRangeMixdown(bridge())).resolves.toEqual({
      ok: false,
      error: 'Enable Cycle before exporting a selected range.',
    });

    expect(exportMixdown).not.toHaveBeenCalled();
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('exports the active selected clip as a native track range render', async () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;
    useDAWStore.setState({
      blocks: [{
        id: 'clip-lead',
        trackId,
        name: 'Lead: Hook',
        startBeat: 4,
        lengthBeats: 2.5,
        type: 'midi',
        color: '#4a7fd4',
        notes: [],
      }],
      selectedBlockId: 'clip-lead',
      selectedBlockIds: ['clip-lead'],
    });

    await expect(exportSelectedClipRender(bridge())).resolves.toEqual({
      ok: true,
      path: '/tmp/mix.wav',
    });

    expect(exportMixdown).toHaveBeenCalledWith({
      title: 'Export Selected Clip',
      defaultPath: 'Lead- Hook Clip.wav',
    });
    expect(renderMixdownPayloads()).toEqual([{
      path: '/tmp/mix.wav',
      trackId,
      startBeat: 4,
      endBeat: 6.5,
      tailBeats: 2,
    }]);
  });

  it('does not open a clip destination when no clip is selected', async () => {
    await expect(exportSelectedClipRender(bridge())).resolves.toEqual({
      ok: false,
      error: 'Select a clip before exporting a clip render.',
    });

    expect(exportMixdown).not.toHaveBeenCalled();
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('exports one native WAV stem per current track', async () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    useDAWStore.getState().addTrackFromTemplate('drum_machine');
    const tracks = useDAWStore.getState().tracks.map(track => ({
      trackId: track.id,
      name: track.name,
    }));

    await expect(exportProjectStems(bridge())).resolves.toEqual({
      ok: true,
      path: '/tmp/stems',
      paths: tracks.map(track => `/tmp/stems/${track.trackId}.wav`),
    });

    expect(exportStems).toHaveBeenCalledWith({
      title: 'Export Stems',
      defaultPath: 'Stems',
      tracks,
    });
    expect(renderMixdownPayloads()).toEqual(tracks.map(track => ({
      path: `/tmp/stems/${track.trackId}.wav`,
      trackId: track.trackId,
    })));
  });

  it('adds cycle bounds to every stem render when Cycle is enabled', async () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;
    useDAWStore.setState({isCycleEnabled: true, cycleStartBeat: 2, cycleEndBeat: 6});

    await expect(exportProjectStems(bridge())).resolves.toEqual({
      ok: true,
      path: '/tmp/stems',
      paths: [`/tmp/stems/${trackId}.wav`],
    });

    expect(renderMixdownPayloads()).toEqual([
      {
        path: `/tmp/stems/${trackId}.wav`,
        startBeat: 2,
        endBeat: 6,
        trackId,
        tailBeats: 2,
      },
    ]);
  });

  it('does not open a stem destination when there are no tracks', async () => {
    await expect(exportProjectStems(bridge())).resolves.toEqual({
      ok: false,
      error: 'Project has no tracks to export as stems.',
    });

    expect(exportStems).not.toHaveBeenCalled();
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('exports only selected MIDI clips when requested', async () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;
    useDAWStore.setState({
      blocks: [{
        id: 'clip-lead',
        trackId,
        name: 'Lead',
        startBeat: 8,
        lengthBeats: 2,
        type: 'midi',
        color: '#4a7fd4',
        notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
      }],
      selectedBlockId: 'clip-lead',
      selectedBlockIds: ['clip-lead'],
    });

    await expect(exportCurrentMidi(bridge(), 'selected')).resolves.toEqual({
      ok: true,
      path: '/tmp/arrangement.mid',
    });

    expect(writeMidiFile).toHaveBeenCalledWith({
      base64: expect.stringMatching(/^TVRoZA/),
      defaultPath: 'Selected MIDI.mid',
    });
  });

  it('rejects cycle MIDI export when Cycle is disabled', async () => {
    await expect(exportCurrentMidi(bridge(), 'cycle')).resolves.toEqual({
      ok: false,
      error: 'Enable Cycle before exporting cycle MIDI.',
    });

    expect(writeMidiFile).not.toHaveBeenCalled();
  });

  it('exports MIDI clipped to the enabled cycle range', async () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;
    useDAWStore.setState({
      isCycleEnabled: true,
      cycleStartBeat: 4,
      cycleEndBeat: 6,
      blocks: [{
        id: 'clip-lead',
        trackId,
        name: 'Lead',
        startBeat: 0,
        lengthBeats: 8,
        type: 'midi',
        color: '#4a7fd4',
        notes: [{note: 64, velocity: 90, startBeat: 3, lengthBeats: 4}],
      }],
    });

    await expect(exportCurrentMidi(bridge(), 'cycle')).resolves.toEqual({
      ok: true,
      path: '/tmp/arrangement.mid',
    });

    expect(writeMidiFile).toHaveBeenCalledWith({
      base64: expect.stringMatching(/^TVRoZA/),
      defaultPath: 'Cycle MIDI.mid',
    });
  });
});
