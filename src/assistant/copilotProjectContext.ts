import {drumMachinePicks, virtualInstrumentSections} from '../music/addTrackCatalog';
import {instrumentById} from '../music/instruments';
import {SAMPLE_KITS} from '../music/sampleCatalog';
import {buildSampleInstrumentRegions} from '../music/sampleInstruments';
import {DEFAULT_TIME_SIGNATURE, type ChordMetadata, type ScaleMetadata, type SectionMarker, type TimeSignature} from '../store/projectMetadata';
import type {ProjectPerformanceMode, LooperLengthBars} from '../transport/performanceMode';
import {DEFAULT_LOOPER_LENGTH_BARS, DEFAULT_PERFORMANCE_MODE} from '../transport/performanceMode';
import type {SnapGrid} from '../ui/snapGrid';
import {DEFAULT_SNAP_GRID} from '../ui/snapGrid';

export type CopilotMusicalContext = {
  bpm: number;
  timeSignature: TimeSignature;
  scale: ScaleMetadata | null;
  chord: ChordMetadata | null;
  snapGrid: SnapGrid;
  isRelativeSnapEnabled: boolean;
  playheadBeat: number;
};

export type CopilotTransportContext = {
  isPlaying: boolean;
  isRecording: boolean;
  isCycleEnabled: boolean;
  cycleStartBeat: number;
  cycleEndBeat: number;
  performanceMode: ProjectPerformanceMode;
  looperLengthBars: LooperLengthBars;
};

export type CopilotSectionSummary = {
  id: string;
  name: string;
  startBeat: number;
  lengthBeats: number;
};

export type CopilotCatalogContext = {
  virtualInstruments: Array<{
    category: string;
    presets: Array<{
      instrumentId: string;
      presetId: string;
      label: string;
      subcategory: string;
      playableRange: {min: number; max: number};
    }>;
  }>;
  drumMachinePresets: Array<{presetId: string; label: string}>;
  sampleKits: Array<{
    id: string;
    label: string;
    tags: string[];
    samples: Array<{id: string; label: string; tags: string[]; triggerNote?: number}>;
  }>;
};

export type CopilotProjectContextInput = {
  musical?: CopilotMusicalContext;
  transport?: CopilotTransportContext;
  sections?: SectionMarker[];
  catalog?: CopilotCatalogContext;
};

const MAX_VIRTUAL_PRESETS = 64;
const MAX_SAMPLE_KIT_SAMPLES = 32;

function finiteBeat(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Number(value.toFixed(6))) : 0;
}

function cleanLabel(value: string, fallback: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > 0 ? compact.slice(0, 64) : fallback;
}

function playableRange(instrumentId: string, subcategory: string): {min: number; max: number} {
  const instrument = instrumentById(instrumentId);
  if (instrument?.nativeInstrument === 'sample_instrument') {
    const regions = buildSampleInstrumentRegions(instrument.sampleInstrumentId ?? instrument.defaultPresetId);
    if (regions.length > 0) {
      return {
        min: Math.min(...regions.map(region => region.minNote)),
        max: Math.max(...regions.map(region => region.maxNote)),
      };
    }
  }
  if (subcategory.includes('Bass') || subcategory === '808') {
    return {min: 36, max: 60};
  }
  return {min: 48, max: 84};
}

export function defaultCopilotMusicalContext(bpm: number): CopilotMusicalContext {
  return {
    bpm,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    snapGrid: DEFAULT_SNAP_GRID,
    isRelativeSnapEnabled: false,
    playheadBeat: 0,
  };
}

export function defaultCopilotTransportContext(isPlaying: boolean, isRecording: boolean): CopilotTransportContext {
  return {
    isPlaying,
    isRecording,
    isCycleEnabled: false,
    cycleStartBeat: 0,
    cycleEndBeat: 0,
    performanceMode: DEFAULT_PERFORMANCE_MODE,
    looperLengthBars: DEFAULT_LOOPER_LENGTH_BARS,
  };
}

export function normalizeCopilotSections(sections: SectionMarker[] | undefined): CopilotSectionSummary[] {
  return (sections ?? []).slice(0, 32).map(section => ({
    id: section.id,
    name: cleanLabel(section.name, 'Section'),
    startBeat: finiteBeat(section.startBeat),
    lengthBeats: finiteBeat(section.lengthBeats),
  }));
}

export function buildCopilotCatalogContext(): CopilotCatalogContext {
  let remaining = MAX_VIRTUAL_PRESETS;
  const virtualInstruments = virtualInstrumentSections()
    .map(section => {
      const presets = section.subcategories.flatMap(subcategory =>
        subcategory.items.map(item => ({
          instrumentId: item.instrumentId,
          presetId: item.presetId,
          label: item.label,
          subcategory: item.subcategory,
          playableRange: playableRange(item.instrumentId, item.subcategory),
        })),
      ).slice(0, remaining);
      remaining -= presets.length;
      return {category: section.heading, presets};
    })
    .filter(section => section.presets.length > 0);

  return {
    virtualInstruments,
    drumMachinePresets: drumMachinePicks(),
    sampleKits: SAMPLE_KITS.map(kit => ({
      id: kit.id,
      label: kit.label,
      tags: [...kit.tags],
      samples: kit.samples.slice(0, MAX_SAMPLE_KIT_SAMPLES).map(sample => ({
        id: sample.id,
        label: sample.label,
        tags: [...sample.tags],
        triggerNote: sample.triggerNote,
      })),
    })),
  };
}
