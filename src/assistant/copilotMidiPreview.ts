import {resolveNativeInstrumentAssignment} from '../music/instruments';
import {createTrackFromTemplate} from '../music/trackTemplates';
import {sendNativeAudioCommand} from '../native/NativeAudioEngine';
import {buildNativeTracksPayload} from '../native/trackPayload';
import {syncTrackInstruments, syncTrackInstrumentToEngine} from '../native/syncTrackInstruments';
import {activeTracks} from '../music/trackOrganization';
import {useDAWStore} from '../store/useDAWStore';
import type {DAWTrack} from '../store/useDAWStore';
import type {CopilotMidiOption} from './copilotMidiOptions';

type PreviewState = {
  optionId: string;
  trackId: string;
};

let activePreview: PreviewState | null = null;

function previewTrackForOption(option: CopilotMidiOption, tracks: DAWTrack[]): DAWTrack {
  return createTrackFromTemplate('virtual_instrument', tracks.length, {
    id: `copilot-preview-${option.id}`,
    instrumentId: option.target.instrumentId,
    presetId: option.target.presetId,
    name: option.target.label ?? option.label,
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

export function stopCopilotMidiOptionPreview(): void {
  if (!activePreview) {
    return;
  }
  sendNativeAudioCommand('stop_midi_phrase_preview', {});
  activePreview = null;
  restoreNativeTracks();
}

export function startCopilotMidiOptionPreview(option: CopilotMidiOption): {ok: true} | {ok: false; error: string} {
  stopCopilotMidiOptionPreview();
  const tracks = activeTracks(useDAWStore.getState().tracks);
  const previewTrack = previewTrackForOption(option, tracks);
  const assignment = resolveNativeInstrumentAssignment(previewTrack);
  if (!assignment) {
    return {ok: false, error: 'This option does not have a previewable instrument.'};
  }
  setNativePreviewTracks(tracks, previewTrack);
  const response = sendNativeAudioCommand('start_midi_phrase_preview', {
    trackId: previewTrack.id,
    lengthBeats: option.lengthBeats,
    notes: option.notes,
  });
  if (!commandSucceeded(response)) {
    sendNativeAudioCommand('stop_midi_phrase_preview', {});
    restoreNativeTracks(tracks);
    return {ok: false, error: 'MIDI preview could not start.'};
  }
  activePreview = {optionId: option.id, trackId: previewTrack.id};
  return {ok: true};
}

export function activeCopilotMidiPreviewOptionId(): string | null {
  return activePreview?.optionId ?? null;
}
