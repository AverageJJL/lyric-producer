import type { DAWTrack, TrackType } from '../store/useDAWStore';
import {
  DEFAULT_AUTOMATION_MODE,
  defaultTrackAutomationLanes,
} from '../automation/trackAutomation';
import { trackNameForAdd } from './addTrackCatalog';
import {
  DEFAULT_TRACK_GAIN_DB,
  DEFAULT_TRACK_PAN,
  DEFAULT_TRACK_VOLUME_DB,
} from './trackMix';
import {
  DRUM_MACHINE_INSTRUMENT,
  INSTRUMENTS,
  KEYS_PIANO,
  VOICE_AUDIO_INSTRUMENT,
  type InstrumentDefinition,
} from './instruments';
import type {SampleInstrumentRegion} from './sampleInstruments';

export type TrackTemplateId =
  | 'voice_audio'
  | 'virtual_instrument'
  | 'drum_machine';

export type TrackTemplateOptions = {
  id?: string;
  instrumentId?: string;
  presetId?: string;
  name?: string;
  samplerRegions?: SampleInstrumentRegion[];
};

let trackCounter = 0;

export function nextTrackId(): string {
  trackCounter += 1;
  return `track-${Date.now()}-${trackCounter}`;
}

function defaultInstrumentForTemplate(
  templateId: TrackTemplateId,
): InstrumentDefinition {
  switch (templateId) {
    case 'voice_audio':
      return VOICE_AUDIO_INSTRUMENT;
    case 'drum_machine':
      return DRUM_MACHINE_INSTRUMENT;
    case 'virtual_instrument':
    default:
      return KEYS_PIANO;
  }
}

function trackTypeForTemplate(templateId: TrackTemplateId): TrackType {
  switch (templateId) {
    case 'voice_audio':
      return 'voice_audio';
    case 'drum_machine':
      return 'drum_machine';
    case 'virtual_instrument':
    default:
      return 'software_instrument';
  }
}

function defaultName(templateId: TrackTemplateId, laneIndex: number): string {
  switch (templateId) {
    case 'voice_audio':
      return `Voice ${laneIndex + 1}`;
    case 'drum_machine':
      return `Drums ${laneIndex + 1}`;
    case 'virtual_instrument':
    default:
      return `Instrument ${laneIndex + 1}`;
  }
}

/** Deterministic track row for add-track flows and future LLM actions. */
export function createTrackFromTemplate(
  templateId: TrackTemplateId,
  laneIndex: number,
  options?: TrackTemplateOptions,
): DAWTrack {
  const resolvedInstrumentId =
    options?.instrumentId ?? defaultInstrumentForTemplate(templateId).id;
  const definition =
    templateId === 'virtual_instrument'
      ? INSTRUMENTS.find(i => i.id === resolvedInstrumentId) ?? KEYS_PIANO
      : defaultInstrumentForTemplate(templateId);

  const presetId =
    options?.presetId && definition.presets.some(p => p.id === options.presetId)
      ? options.presetId
      : definition.defaultPresetId;

  const name =
    options?.name ??
    trackNameForAdd(templateId, laneIndex, resolvedInstrumentId, presetId) ??
    defaultName(templateId, laneIndex);

  return {
    id: options?.id ?? nextTrackId(),
    name,
    isMuted: false,
    isSolo: false,
    type: trackTypeForTemplate(templateId),
    instrumentId: resolvedInstrumentId,
    presetId,
    isRecordArmed: false,
    isInputMonitoringEnabled: false,
    automationMode: DEFAULT_AUTOMATION_MODE,
    automationLanes: defaultTrackAutomationLanes(),
    isLocked: false,
    volumeDb: DEFAULT_TRACK_VOLUME_DB,
    pan: DEFAULT_TRACK_PAN,
    gainDb: DEFAULT_TRACK_GAIN_DB,
    samplerRegions: options?.samplerRegions?.map(region => ({...region})),
  };
}
