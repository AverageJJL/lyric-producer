import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

import {openSamplesDock} from './helpers/workspacePanels';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const importAudio = jest.fn();
const browseSamples = jest.fn();
const sampleLibraryStatus = jest.fn();
const downloadSampleLibrary = jest.fn();
const deleteSampleLibraryPack = jest.fn();

function resetStore(): void {
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [],
    patterns: {},
    blocks: [],
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    isRecording: false,
    recordingBlockId: null,
    recordingStartSeconds: null,
    recordingWallClockStart: null,
    recordingError: null,
    playheadBeat: 0,
    playheadSeconds: 0,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    playStartSeconds: 0,
    syncSource: 'ui',
    performanceMode: 'linear',
    looperLengthBars: 4,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    midiAudition: null,
  });
}

function libraryStatus(state: 'missing' | 'installed') {
  return {
    ok: true,
    libraryId: 'cc0-core',
    displayName: 'CC0 Core Library',
    license: 'CC0-1.0',
    state,
    installedBytes: state === 'installed' ? 4 : 0,
    totalBytes: 4,
    fileCount: 1,
    packs: [{
      id: 'core-drums',
      family: 'drums',
      displayName: 'Core Drums',
      license: 'CC0-1.0',
      fileCount: 1,
      totalBytes: 4,
      installedBytes: state === 'installed' ? 4 : 0,
      state,
      sourceName: 'Fixture',
    }],
  };
}

beforeEach(() => {
  resetStore();
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({ok: true, data: {deviceName: 'Mock Output', sampleRate: 48000}});
    }
    if (command === 'analyze_audio_file') {
      return JSON.stringify({
        ok: true,
        data: {
          durationSeconds: 2,
          lengthBeats: 4,
          waveformPeaks: [0.1, 0.2],
          sampleRate: 48000,
          channelCount: 2,
          fileBytes: 4,
          peakAmplitude: 0.5,
        },
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  sampleLibraryStatus.mockResolvedValue(libraryStatus('missing'));
  downloadSampleLibrary.mockResolvedValue(libraryStatus('installed'));
  deleteSampleLibraryPack.mockResolvedValue(libraryStatus('missing'));
  browseSamples
    .mockResolvedValueOnce({ok: true, providers: [], samples: []})
    .mockResolvedValue({
      ok: true,
      providers: [{id: 'royalty_free_library', label: 'Royalty-Free Library'}],
      samples: [{
        id: 'royalty_free_library:drums/kick.wav',
        providerId: 'royalty_free_library',
        providerLabel: 'Royalty-Free Library',
        packId: 'core-drums',
        packLabel: 'Core Drums',
        family: 'drums',
        name: 'Kick',
        absolutePath: '/tmp/sample-library/core-drums/kick.wav',
        fileBytes: 4,
        modifiedAt: '2026-06-04T00:00:00.000Z',
        tags: ['drums', 'kick'],
      }],
    });
  importAudio.mockResolvedValue({
    ok: true,
    originalPath: '/tmp/sample-library/core-drums/kick.wav',
    absolutePath: '/tmp/assets/imports/kick.wav',
    relativePath: 'imports/kick.wav',
    name: 'Kick',
  });
  window.audioEngine = {sendCommand, onEvent: () => () => undefined};
  window.mediaImport = {
    importAudio,
    browseSamples,
    sampleLibraryStatus,
    downloadSampleLibrary,
    deleteSampleLibraryPack,
  };
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  importAudio.mockReset();
  browseSamples.mockReset();
  sampleLibraryStatus.mockReset();
  downloadSampleLibrary.mockReset();
  deleteSampleLibraryPack.mockReset();
  window.localStorage.clear();
  delete window.mediaImport;
  delete window.audioEngine;
});

test('downloads grouped samples, filters by family, deletes packs, and imports installed samples', async () => {
  render(<App />);
  openSamplesDock();

  fireEvent.click(await screen.findByRole('button', {name: 'Download CC0 Core Library'}));

  await waitFor(() => {
    expect(downloadSampleLibrary).toHaveBeenCalled();
  });
  expect(browseSamples).toHaveBeenCalledWith({
    providerId: 'royalty_free_library',
    query: '',
    family: undefined,
    limit: 24,
  });
  fireEvent.click(await screen.findByRole('button', {name: 'Drums'}));
  await waitFor(() => {
    expect(browseSamples).toHaveBeenCalledWith({
      providerId: 'royalty_free_library',
      query: '',
      family: 'drums',
      limit: 24,
    });
  });
  fireEvent.click(await screen.findByRole('button', {name: 'Import sample Kick'}));

  await waitFor(() => {
    expect(importAudio).toHaveBeenCalledWith({path: '/tmp/sample-library/core-drums/kick.wav'});
  });
  fireEvent.click(await screen.findByRole('button', {name: 'Delete'}));
  await waitFor(() => {
    expect(deleteSampleLibraryPack).toHaveBeenCalledWith({packId: 'core-drums'});
  });
});
