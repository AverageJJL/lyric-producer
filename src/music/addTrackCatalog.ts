import type { TrackTemplateId } from './trackTemplates';
import {
  INSTRUMENT_TAXONOMY,
  DRUM_MACHINE_INSTRUMENT,
  instrumentById,
  presetLabel,
  type InstrumentCategory,
  type InstrumentSubcategory,
} from './instruments';

export type AddTrackRootOption = {
  id: string;
  label: string;
  templateId: TrackTemplateId;
  hasSubmenu: boolean;
};

export type VirtualInstrumentPick = {
  instrumentId: string;
  presetId: string;
  label: string;
  category: InstrumentCategory;
  subcategory: InstrumentSubcategory;
};

export type VirtualInstrumentSubsection = {
  heading: InstrumentSubcategory;
  items: VirtualInstrumentPick[];
};

export type VirtualInstrumentSection = {
  heading: InstrumentCategory;
  subcategories: VirtualInstrumentSubsection[];
};

export function rootAddTrackOptions(): AddTrackRootOption[] {
  return [
    {
      id: 'virtual_instrument',
      label: 'Virtual Instrument',
      templateId: 'virtual_instrument',
      hasSubmenu: true,
    },
    {
      id: 'drum_machine',
      label: 'Drum Machine',
      templateId: 'drum_machine',
      hasSubmenu: false,
    },
    {
      id: 'voice_audio',
      label: 'Voice / Audio',
      templateId: 'voice_audio',
      hasSubmenu: false,
    },
  ];
}

/** Hierarchical preset picks grouped by category -> subcategory -> preset. */
export function virtualInstrumentSections(): VirtualInstrumentSection[] {
  return INSTRUMENT_TAXONOMY.map(section => ({
    heading: section.heading,
    subcategories: section.subcategories.map(subcategory => ({
      heading: subcategory.heading,
      items: subcategory.items.map(item => ({...item})),
    })),
  }));
}

export function drumMachinePicks(): { presetId: string; label: string }[] {
  return DRUM_MACHINE_INSTRUMENT.presets.map(preset => ({
    presetId: preset.id,
    label: preset.label,
  }));
}

/** Suggested track row name when adding from the menu. */
export function trackNameForAdd(
  templateId: TrackTemplateId,
  laneIndex: number,
  instrumentId?: string,
  presetId?: string,
): string {
  if (templateId === 'voice_audio') {
    return `Voice ${laneIndex + 1}`;
  }
  if (templateId === 'drum_machine') {
    const preset = DRUM_MACHINE_INSTRUMENT.presets.find(p => p.id === presetId);
    return preset?.label ?? `Drums ${laneIndex + 1}`;
  }
  if (templateId === 'virtual_instrument' && instrumentId && presetId) {
    const instrument = instrumentById(instrumentId);
    if (instrument) {
      return presetLabel(instrument, presetId);
    }
  }
  return `Instrument ${laneIndex + 1}`;
}
