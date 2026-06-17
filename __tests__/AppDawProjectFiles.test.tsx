import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {openProjectMenu} from './helpers/projectMenu';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const saveProject = jest.fn();
const openProject = jest.fn();
const exportMixdown = jest.fn();
const importDawProject = jest.fn();
const exportDawProject = jest.fn();

const notesProjectXml = `
<Project version="1.0">
  <Transport><Tempo value="110"/><TimeSignature numerator="4" denominator="4"/></Transport>
  <Structure>
    <Track contentType="notes" id="track-a" name="Keys">
      <Channel role="regular"><Mute value="false"/><Pan value="0.5"/><Volume value="1"/></Channel>
    </Track>
  </Structure>
  <Arrangement><Lanes><Lanes track="track-a"><Clips>
    <Clip time="0" duration="4" name="Phrase"><Notes>
      <Note time="0" duration="1" key="60" vel="0.8"/>
    </Notes></Clip>
  </Clips></Lanes></Lanes></Arrangement>
  <Scenes/>
</Project>`;

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
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    midiAudition: null,
  });
}

beforeEach(() => {
  resetStore();
  window.localStorage.clear();
  sendCommand.mockImplementation((command: string) => JSON.stringify({
    ok: true,
    data: command === 'engine_status' || command === 'engine_status_fast'
      ? {deviceName: 'Mock Output', sampleRate: 48000}
      : {},
  }));
  importDawProject.mockResolvedValue({
    ok: true,
    path: '/tmp/import.dawproject',
    projectXml: notesProjectXml,
    mediaFiles: [],
  });
  exportDawProject.mockResolvedValue({ok: true, path: '/tmp/export.dawproject'});
  window.audioEngine = {sendCommand, onEvent: () => () => undefined};
  window.projectFiles = {
    exportDawProject,
    exportMixdown,
    importDawProject,
    openProject,
    saveProject,
  };
  window.mediaImport = {
    importAudio: jest.fn(),
    resolveAudioMedia: jest.fn(async () => ({ok: true as const, resolved: []})),
  };
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  window.localStorage.clear();
  delete window.audioEngine;
  delete window.projectFiles;
  delete window.mediaImport;
});

test('imports DAWproject as an unsaved dirty project', async () => {
  render(<App />);
  openProjectMenu();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', {name: 'Import DAWproject'}));
  });

  expect(importDawProject).toHaveBeenCalledTimes(1);
  expect(useDAWStore.getState().tracks[0]?.name).toBe('Keys');
  expect(useDAWStore.getState().blocks[0]?.name).toBe('Phrase');
  openProjectMenu();
  expect(screen.getByText('Untitled *')).toBeInTheDocument();
  expect(screen.getByTitle('DAWproject imported (1 tracks; 1 clips)')).toBeInTheDocument();
  expect(window.localStorage.getItem('aiProducerCore.autosaveDraft')).toContain('"path":null');
});

test('exports the current arrangement as DAWproject through the bridge', async () => {
  act(() => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
  });
  render(<App />);
  openProjectMenu();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', {name: 'DAWproject'}));
  });

  expect(exportDawProject).toHaveBeenCalledWith(expect.objectContaining({
    mediaFiles: [],
    projectXml: expect.stringContaining('<Project version="1.0">'),
  }));
});
