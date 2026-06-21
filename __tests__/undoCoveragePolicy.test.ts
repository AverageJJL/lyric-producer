import fs from 'fs';
import path from 'path';
type UndoPolicy = 'history' | 'delegates-history' | 'no-history';

const repoRoot = path.resolve(__dirname, '..');
const storeSource = fs.readFileSync(path.join(repoRoot, 'src/store/useDAWStore.ts'), 'utf8');
const storeImplementation = storeSource.slice(storeSource.indexOf('export const useDAWStore'));
const lyricActionsSource = fs.readFileSync(path.join(repoRoot, 'src/store/lyricActions.ts'), 'utf8');
const lyricActionsImplementation = lyricActionsSource.slice(lyricActionsSource.indexOf('export function createLyricActions'));
const srcRoot = path.join(repoRoot, 'src');

const actionPolicy: Record<string, {policy: UndoPolicy; reason: string}> = {
  undo: {policy: 'no-history', reason: 'history stack control'},
  redo: {policy: 'no-history', reason: 'history stack control'},
  canUndo: {policy: 'no-history', reason: 'history stack query'},
  canRedo: {policy: 'no-history', reason: 'history stack query'},
  setIsPlaying: {policy: 'no-history', reason: 'transport state'},
  setPlayheadBeat: {policy: 'no-history', reason: 'transport position'},
  setBpm: {policy: 'history', reason: 'project tempo'},
  setTempoMapEvent: {policy: 'history', reason: 'project tempo map'},
  removeTempoMapEventAtBeat: {policy: 'history', reason: 'project tempo map'},
  setMeterMapEvent: {policy: 'history', reason: 'project meter map'},
  removeMeterMapEventAtBeat: {policy: 'history', reason: 'project meter map'},
  setMetronomeEnabled: {policy: 'no-history', reason: 'playback preference'},
  setRecordingCountInBeats: {policy: 'no-history', reason: 'recording preference'},
  setRecordingPreRollBeats: {policy: 'no-history', reason: 'recording preference'},
  setPunchRecordingEnabled: {policy: 'no-history', reason: 'recording preference'},
  setLoopRecordingEnabled: {policy: 'no-history', reason: 'recording preference'},
  setRecordingLatencyCompensationMs: {policy: 'no-history', reason: 'recording preference'},
  addTrackFromTemplate: {policy: 'history', reason: 'track creation'},
  addSoftwareInstrumentTrack: {policy: 'delegates-history', reason: 'calls addTrackFromTemplate'},
  addVoiceAudioTrack: {policy: 'delegates-history', reason: 'calls addTrackFromTemplate'},
  addDrumMachineTrack: {policy: 'delegates-history', reason: 'calls addTrackFromTemplate'},
  moveTrack: {policy: 'history', reason: 'track lane order'},
  setTrackArchived: {policy: 'history', reason: 'track archive state'},
  setTrackDisabled: {policy: 'history', reason: 'track playback state'},
  setTrackFrozen: {policy: 'history', reason: 'track freeze state'},
  setTrackFolderName: {policy: 'history', reason: 'track folder metadata'},
  setTrackGroupName: {policy: 'history', reason: 'track group metadata'},
  setTrackHeightScale: {policy: 'history', reason: 'track lane height metadata'},
  setTrackInstrument: {policy: 'history', reason: 'track sound state'},
  removeTrack: {policy: 'history', reason: 'track deletion'},
  toggleTrackMute: {policy: 'history', reason: 'track mix state'},
  toggleTrackSolo: {policy: 'history', reason: 'track mix state'},
  setTrackInputMonitoring: {policy: 'history', reason: 'track monitoring state'},
  setTrackAutomationMode: {policy: 'history', reason: 'automation state'},
  upsertTrackAutomationLane: {policy: 'history', reason: 'automation lane state'},
  setTrackAutomationPoint: {policy: 'history', reason: 'automation point state'},
  removeTrackAutomationPoint: {policy: 'history', reason: 'automation point state'},
  setTrackVolumeDb: {policy: 'history', reason: 'track mix state'},
  setTrackPan: {policy: 'history', reason: 'track mix state'},
  setTrackGainDb: {policy: 'history', reason: 'track mix state'},
  setTrackRoutingRole: {policy: 'history', reason: 'track routing role metadata'},
  setTrackOutput: {policy: 'history', reason: 'track routing state'},
  setTrackSend: {policy: 'history', reason: 'track routing state'},
  removeTrackSend: {policy: 'history', reason: 'track routing state'},
  setTrackSidechainSource: {policy: 'history', reason: 'track sidechain routing state'},
  setMasterVolumeDb: {policy: 'history', reason: 'master mix state'},
  setMasterPan: {policy: 'history', reason: 'master mix state'},
  setSnapGrid: {policy: 'no-history', reason: 'editing preference'},
  setRelativeSnapEnabled: {policy: 'no-history', reason: 'editing preference'},
  setPerformanceMode: {policy: 'history', reason: 'project performance mode'},
  setLooperLengthBars: {policy: 'history', reason: 'looper container length'},
  setCycleEnabled: {policy: 'history', reason: 'cycle locator state'},
  setCycleRange: {policy: 'history', reason: 'cycle locator state'},
  setTrackPreset: {policy: 'history', reason: 'track sound state'},
  setTrackLocked: {policy: 'history', reason: 'track arrangement state'},
  setTimeSignature: {policy: 'history', reason: 'project meter'},
  setScale: {policy: 'history', reason: 'project music metadata'},
  setChord: {policy: 'history', reason: 'project music metadata'},
  setSections: {policy: 'history', reason: 'arranger sections'},
  setLyrics: {policy: 'history', reason: 'authored lyrics document'},
  addLyricSection: {policy: 'history', reason: 'authored lyrics section creation'}, removeLyricSection: {policy: 'history', reason: 'authored lyrics section deletion'},
  renameLyricSection: {policy: 'history', reason: 'authored lyrics section metadata'}, setLyricSectionTiming: {policy: 'history', reason: 'authored lyrics section timing'},
  addLyricLine: {policy: 'history', reason: 'authored lyrics line creation'}, removeLyricLine: {policy: 'history', reason: 'authored lyrics line deletion'},
  updateLyricLineText: {policy: 'history', reason: 'authored lyrics line text'}, setLyricLineTiming: {policy: 'history', reason: 'authored lyrics line timing'},
  stampLyricSectionStart: {policy: 'history', reason: 'authored lyrics playhead stamp'},
  stampLyricLine: {policy: 'history', reason: 'authored lyrics playhead stamp'},
  estimateLyricSectionTimings: {policy: 'history', reason: 'authored lyrics timing estimate'}, syncLyricTimings: {policy: 'history', reason: 'authored lyrics timing sync'},
  setLyricSimilarityReport: {policy: 'history', reason: 'authored lyrics similarity metadata'},
  toggleTrackRecordArm: {policy: 'history', reason: 'track record-arm state'},
  selectTrack: {policy: 'no-history', reason: 'selection state'},
  setIsRecording: {policy: 'no-history', reason: 'recording runtime state'},
  startRecordingSession: {policy: 'history', reason: 'recording clip creation'},
  activateRecordingSession: {policy: 'no-history', reason: 'recording runtime state'},
  abortRecordingSession: {policy: 'no-history', reason: 'recording cleanup'},
  clearRecordingError: {policy: 'no-history', reason: 'recording error UI'},
  finalizeRecordingSession: {policy: 'no-history', reason: 'recording transaction commit'},
  addTrackWithBlock: {policy: 'history', reason: 'atomic track and clip creation'},
  addBlock: {policy: 'history', reason: 'clip creation'},
  createMidiClipAtBeat: {policy: 'history', reason: 'MIDI clip creation'},
  moveBlock: {policy: 'history', reason: 'clip timing'},
  resizeBlock: {policy: 'history', reason: 'clip timing'},
  updateBlock: {policy: 'history', reason: 'clip metadata'},
  setMediaSourceName: {policy: 'history', reason: 'media source metadata'},
  setBlockLocked: {policy: 'history', reason: 'clip arrangement state'},
  compLooperLayer: {policy: 'history', reason: 'looper layer comping'},
  compRecordingTake: {policy: 'history', reason: 'linear recording take comping'},
  setRecordingCompRange: {policy: 'history', reason: 'recording comp edit range'},
  selectRecordingCompTake: {policy: 'history', reason: 'recording take comp selection'},
  setAuditionedRecordingTake: {policy: 'no-history', reason: 'recording take preview state'},
  switchRecordingCompVersion: {policy: 'history', reason: 'recording comp version selection'},
  duplicateRecordingCompVersion: {policy: 'history', reason: 'recording comp version creation'},
  renameRecordingCompVersion: {policy: 'history', reason: 'recording comp version metadata'},
  flattenRecordingCompGroup: {policy: 'history', reason: 'recording comp render commit'},
  replaceAudioBlockMedia: {policy: 'history', reason: 'clip media state'},
  replaceAudioBlocksMedia: {policy: 'history', reason: 'batch clip media state'},
  removeBlock: {policy: 'history', reason: 'clip deletion'},
  removeBlocks: {policy: 'history', reason: 'bulk clip deletion'},
  selectBlock: {policy: 'no-history', reason: 'selection state'},
  addNoteToBlock: {policy: 'history', reason: 'MIDI note creation'},
  removeNoteFromBlock: {policy: 'history', reason: 'MIDI note deletion'},
  updateNoteInBlock: {policy: 'history', reason: 'MIDI note edit'},
  replaceBlockNotes: {policy: 'history', reason: 'MIDI note edit'},
  toggleDrumStep: {policy: 'history', reason: 'drum pattern edit'},
  createDrumPattern: {policy: 'history', reason: 'drum pattern creation'},
  applyEngineTransportState: {policy: 'no-history', reason: 'engine transport mirror'},
  setMidiAudition: {policy: 'no-history', reason: 'live preview state'},
  clearMidiAudition: {policy: 'no-history', reason: 'live preview state'},
  beginLiveMidiNote: {policy: 'no-history', reason: 'live preview state'},
  endLiveMidiNote: {policy: 'no-history', reason: 'live preview state'},
  tickLiveMidiPreview: {policy: 'no-history', reason: 'live preview state'},
  clearLiveMidiPreview: {policy: 'no-history', reason: 'live preview state'},
  appendLiveAudioPeaks: {policy: 'no-history', reason: 'live preview state'},
  clearLiveAudioPreview: {policy: 'no-history', reason: 'live preview state'},
  requestSpectrogramForRecordedClip: {policy: 'no-history', reason: 'native render bookkeeping'},
  applySpectrogramReady: {policy: 'no-history', reason: 'native render bookkeeping'},
};

const directSetStatePolicy: Record<string, {policy: UndoPolicy; reason: string}> = {
  'src/assistant/copilotMidiOptions.ts': {
    policy: 'no-history',
    reason: 'option-import selection state (clip creation runs through applyArrangementOperations)',
  },
  'src/assistant/copilotDrumPatternOptions.ts': {
    policy: 'no-history',
    reason: 'option-import selection state (clip creation runs through applyArrangementOperations)',
  },
  'src/arrangement/arrangementOperationMutations.ts': {
    policy: 'history',
    reason: 'scripted restore/upsert mutations',
  },
  'src/arrangement/audioClipCrossfadeCommands.ts': {
    policy: 'history',
    reason: 'audio clip fade metadata mutation',
  },
  'src/arrangement/audioClipEditCommands.ts': {
    policy: 'history',
    reason: 'audio clip edit metadata mutation',
  },
  'src/arrangement/audioClipRenderInPlace.ts': {
    policy: 'history',
    reason: 'native audio render-in-place mutation',
  },
  'src/arrangement/clipAdvancedEditCommands.ts': {
    policy: 'history',
    reason: 'advanced clip edit mutation',
  },
  'src/arrangement/clipBulkMove.ts': {policy: 'history', reason: 'bulk clip move mutation'},
  'src/arrangement/clipClipboard.ts': {policy: 'history', reason: 'clipboard paste mutation'},
  'src/arrangement/clipConsolidateCommands.ts': {
    policy: 'history',
    reason: 'MIDI clip consolidation mutation',
  },
  'src/arrangement/clipEditCommands.ts': {policy: 'history', reason: 'clip edit mutation'},
  'src/arrangement/clipMarqueeSelection.ts': {
    policy: 'no-history',
    reason: 'selection-only marquee commit',
  },
  'src/arrangement/clipQuantizeCommands.ts': {
    policy: 'history',
    reason: 'selected MIDI clip quantize mutation',
  },
  'src/arrangement/clipTrimToSelectionCommands.ts': {
    policy: 'history',
    reason: 'clip trim-to-cycle mutation',
  },
  'src/arrangement/midiImportActions.ts': {policy: 'history', reason: 'MIDI import mutation'},
  'src/arrangement/projectRestore.ts': {
    policy: 'no-history',
    reason: 'project document restore replaces session state',
  },
  'src/arrangement/samplerSliceOperation.ts': {
    policy: 'history',
    reason: 'sliced sampler track and clip creation',
  },
  'src/arrangement/sectionEditCommands.ts': {
    policy: 'history',
    reason: 'arranger section duplication mutation',
  },
  'src/hooks/useRecordingLaunch.ts': {
    policy: 'no-history',
    reason: 'recording launch runtime cycle enablement',
  },
  'src/store/dawRecording.ts': {
    policy: 'no-history',
    reason: 'recording and transport runtime state',
  },
};

function actionNamesFromType(source: string, typeName: string): string[] {
  const block = new RegExp(`(?:export\\s+)?type ${typeName} = [^{]*\\{([\\s\\S]*?)\\n\\};`)
    .exec(source)?.[1];
  if (!block) {
    throw new Error(`Could not locate ${typeName} declaration.`);
  }
  return [...block.matchAll(/^\s{2}([A-Za-z]\w*):/gm)].map(match => match[1]!);
}

function declaredActionNames(): string[] {
  return [
    ...actionNamesFromType(lyricActionsSource, 'LyricActions'),
    ...actionNamesFromType(storeSource, 'DAWActions'),
  ];
}

function actionBodyFrom(source: string, actionName: string, spaces: number): string | null {
  const match = new RegExp(`\\n\\s{${spaces}}${actionName}:`).exec(source);
  if (!match) {
    return null;
  }
  const bodyStart = match.index + match[0].length;
  const next = new RegExp(`\\n\\s{${spaces}}[A-Za-z]\\w*:\\s`)
    .exec(source.slice(bodyStart));
  return source.slice(
    bodyStart,
    next ? bodyStart + next.index : source.length,
  );
}

function actionBody(actionName: string): string {
  const body = actionBodyFrom(storeImplementation, actionName, 2)
    ?? actionBodyFrom(lyricActionsImplementation, actionName, 4);
  if (!body) {
    throw new Error(`Could not locate implementation for ${actionName}.`);
  }
  return body;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(fullPath);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function directSetStateFiles(): string[] {
  return sourceFiles(srcRoot)
    .filter(file => fs.readFileSync(file, 'utf8').includes('useDAWStore.setState'))
    .map(file => path.relative(repoRoot, file).split(path.sep).join('/'));
}

describe('DAW store undo coverage policy', () => {
  it('classifies every declared store action', () => {
    const declared = declaredActionNames().sort();
    const classified = Object.keys(actionPolicy).sort();

    expect(classified).toEqual(declared);
    expect(
      Object.entries(actionPolicy).filter(([, entry]) => entry.reason.trim().length === 0),
    ).toEqual([]);
  });

  it('records history in main-store arrangement mutation actions', () => {
    const missingHistory = Object.entries(actionPolicy)
      .filter(([, entry]) => entry.policy === 'history')
      .map(([name]) => name)
      .filter(name => {
        const body = actionBody(name);
        return !body.includes('recordHistoryBeforeMutation(get)') &&
          !body.includes('recordHistory');
      });

    expect(missingHistory).toEqual([]);
  });

  it('classifies direct store writes outside the main store', () => {
    expect(Object.keys(directSetStatePolicy).sort()).toEqual(directSetStateFiles().sort());
    expect(
      Object.entries(directSetStatePolicy).filter(([, entry]) => entry.reason.trim().length === 0),
    ).toEqual([]);
  });

  it('records history in direct store-write mutation modules', () => {
    const missingHistory = Object.entries(directSetStatePolicy)
      .filter(([, entry]) => entry.policy === 'history')
      .map(([file]) => file)
      .filter(file => {
        const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
        return !source.includes('recordArrangementHistory') ||
          !source.includes('captureArrangementHistorySnapshot');
      });

    expect(missingHistory).toEqual([]);
  });
});
