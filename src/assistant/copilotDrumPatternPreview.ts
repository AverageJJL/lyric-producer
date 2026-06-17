import {createTrackFromTemplate} from '../music/trackTemplates';
import {patternStepsPayload} from '../music/drumPatterns';
import {activeTracks} from '../music/trackOrganization';
import {sendNativeAudioCommand} from '../native/NativeAudioEngine';
import {buildNativeTracksPayload} from '../native/trackPayload';
import {syncTrackInstruments, syncTrackInstrumentToEngine} from '../native/syncTrackInstruments';
import type {DAWTrack} from '../store/useDAWStore';
import {useDAWStore} from '../store/useDAWStore';
import {
  patternFromCopilotDrumLanes,
  type CopilotDrumPatternOption,
} from './copilotDrumPatternOptions';
import {stopCopilotMidiOptionPreview} from './copilotMidiPreview';

type PreviewState = {
  optionId: string;
  trackId: string;
};

let activePreview: PreviewState | null = null;

function previewTrackForOption(option: CopilotDrumPatternOption, tracks: DAWTrack[]): DAWTrack {
  return createTrackFromTemplate('drum_machine', tracks.length, {
    id: `copilot-drum-preview-${option.id}`,
    name: 'Copilot Drum Preview',
  });
}

function setNativePreviewTracks(realTracks: DAWTrack[], previewTrack: DAWTrack): void {
  sendNativeAudioCommand('setTracks', {
    tracks: buildNativeTracksPayload([...realTracks, previewTrack]),
  });
  syncTrackInstruments(realTracks);
  syncTrackInstrumentToEngine(previewTrack);
}

function restoreNativeTracks(realTracks = activeTracks(useDAWStore.getState().tracks)): void {
  sendNativeAudioCommand('setTracks', {tracks: buildNativeTracksPayload(realTracks)});
  syncTrackInstruments(realTracks);
}

function commandSucceeded(response: string | null): boolean {
  if (!response) {
    return false;
  }
  try {
    return JSON.parse(response)?.ok === true;
  } catch {
    return false;
  }
}

export function stopCopilotDrumPatternPreview(): void {
  if (!activePreview) {
    return;
  }
  sendNativeAudioCommand('stop_pattern_preview', {});
  activePreview = null;
  restoreNativeTracks();
}

export function startCopilotDrumPatternPreview(
  option: CopilotDrumPatternOption,
): {ok: true} | {ok: false; error: string} {
  stopCopilotMidiOptionPreview();
  stopCopilotDrumPatternPreview();
  const tracks = activeTracks(useDAWStore.getState().tracks);
  const previewTrack = previewTrackForOption(option, tracks);
  setNativePreviewTracks(tracks, previewTrack);
  const pattern = patternFromCopilotDrumLanes(option.lanes, option.label, `preview-${option.id}`);
  const response = sendNativeAudioCommand('start_pattern_preview', {
    trackId: previewTrack.id,
    bpm: useDAWStore.getState().bpm,
    lanes: patternStepsPayload(pattern),
  });
  if (!commandSucceeded(response)) {
    sendNativeAudioCommand('stop_pattern_preview', {});
    restoreNativeTracks(tracks);
    return {ok: false, error: 'Drum preview could not start.'};
  }
  activePreview = {optionId: option.id, trackId: previewTrack.id};
  return {ok: true};
}

export function activeCopilotDrumPreviewOptionId(): string | null {
  return activePreview?.optionId ?? null;
}
