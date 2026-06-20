/** Musical metadata carried in snapshots and undo history (UI-authoritative). */
import {
  cloneReferenceMoodAnalysis,
  normalizeReferenceMoodAnalysis,
  type ReferenceMoodAnalysis,
} from './referenceMoodAnalysis';

export type TimeSignature = {
  numerator: number;
  denominator: number;
};

export type ScaleMetadata = {
  root: string;
  mode: string;
};

export type ChordMetadata = {
  symbol: string;
};

export const PROJECT_KEY_ROOTS = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const;

export const PROJECT_SCALE_MODES = ['major', 'minor'] as const;

export type ProducerInsight = {
  intent: string;
  arrangementMove: string;
  vocalTreatment: string;
  soundPalette: string;
  mixFocus: string;
  risk: string;
};

/**
 * Display label for the project key. Returns '' when no key is set — the project
 * default is `scale: null`, and the UI should show "no key" rather than fabricating
 * a "C Maj" that's indistinguishable from a deliberately-chosen C major. We also treat
 * a malformed scale (missing/empty root) as unset, so a bad agent-supplied value can't
 * masquerade as C major either.
 */
export function projectScaleLabel(scale: ScaleMetadata | null): string {
  if (!scale || typeof scale.root !== 'string' || scale.root.length === 0) {
    return '';
  }
  const mode = scale.mode === 'minor' ? 'Min' : 'Maj';
  return `${scale.root} ${mode}`;
}

export type SectionMarker = {
  id: string;
  name: string;
  startBeat: number;
  lengthBeats: number;
  analysis?: {
    mood: string;
    key: string;
    meaning: string;
    productionCue: string;
    productionDrivers?: string[];
    producerInsight?: ProducerInsight;
    bpm?: number;
    bpmSource?: string;
    bpmConfidence?: number;
    keyConfidence?: number;
    confidence?: number;
    reference?: ReferenceMoodAnalysis;
    lyricRange?: {startLine: number; endLine: number};
    lyrics?: string[];
    lyricPreview: string[];
  };
};

export function cloneSectionMarker(section: SectionMarker): SectionMarker {
  return {
    ...section,
    analysis: section.analysis
      ? {
          ...section.analysis,
          productionDrivers: section.analysis.productionDrivers
            ? [...section.analysis.productionDrivers]
            : undefined,
          producerInsight: section.analysis.producerInsight
            ? {...section.analysis.producerInsight}
            : undefined,
          lyricRange: section.analysis.lyricRange
            ? {...section.analysis.lyricRange}
            : undefined,
          reference: section.analysis.reference
            ? cloneReferenceMoodAnalysis(section.analysis.reference)
            : undefined,
          lyrics: section.analysis.lyrics ? [...section.analysis.lyrics] : undefined,
          lyricPreview: [...(section.analysis.lyricPreview ?? [])],
        }
      : undefined,
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function producerInsight(value: unknown): ProducerInsight | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const insight = {
    intent: stringOr(raw.intent, ''),
    arrangementMove: stringOr(raw.arrangementMove, ''),
    vocalTreatment: stringOr(raw.vocalTreatment, ''),
    soundPalette: stringOr(raw.soundPalette, ''),
    mixFocus: stringOr(raw.mixFocus, ''),
    risk: stringOr(raw.risk, ''),
  };
  return Object.values(insight).some(item => item.length > 0) ? insight : undefined;
}

export function normalizeSectionMarker(value: unknown): SectionMarker | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const startBeat = positiveNumber(raw.startBeat) ?? (raw.startBeat === 0 ? 0 : undefined);
  const lengthBeats = positiveNumber(raw.lengthBeats);
  if ((!startBeat && startBeat !== 0) || !lengthBeats) {
    return null;
  }
  const base: SectionMarker = {
    id: stringOr(raw.id, `section-${startBeat}`),
    name: stringOr(raw.name, 'Section'),
    startBeat,
    lengthBeats,
  };
  const analysis = raw.analysis as Record<string, unknown> | undefined;
  if (!analysis || typeof analysis !== 'object') {
    return base;
  }
  const lyricRange = analysis.lyricRange as Record<string, unknown> | undefined;
  return cloneSectionMarker({
    ...base,
    analysis: {
      mood: stringOr(analysis.mood, ''),
      key: stringOr(analysis.key, ''),
      meaning: stringOr(analysis.meaning, ''),
      productionCue: stringOr(analysis.productionCue, ''),
      productionDrivers: stringArray(analysis.productionDrivers),
      producerInsight: producerInsight(analysis.producerInsight),
      bpm: positiveNumber(analysis.bpm),
      bpmSource: stringOr(analysis.bpmSource, ''),
      bpmConfidence: typeof analysis.bpmConfidence === 'number' ? analysis.bpmConfidence : undefined,
      keyConfidence: typeof analysis.keyConfidence === 'number' ? analysis.keyConfidence : undefined,
      confidence: typeof analysis.confidence === 'number' ? analysis.confidence : undefined,
      reference: normalizeReferenceMoodAnalysis(analysis.reference),
      lyricRange: typeof lyricRange?.startLine === 'number' && typeof lyricRange.endLine === 'number'
        ? {startLine: lyricRange.startLine, endLine: lyricRange.endLine}
        : undefined,
      lyrics: stringArray(analysis.lyrics),
      lyricPreview: stringArray(analysis.lyricPreview) ?? [],
    },
  });
}

export const DEFAULT_TIME_SIGNATURE: TimeSignature = {
  numerator: 4,
  denominator: 4,
};

export const TIME_SIGNATURE_NUMERATORS = [2, 3, 4, 5, 6, 7, 9, 12] as const;
export const TIME_SIGNATURE_DENOMINATORS = [2, 4, 8, 16] as const;

function allowedOrDefault(
  value: number | undefined,
  allowed: readonly number[],
  fallback: number,
): number {
  return value !== undefined && allowed.includes(value) ? value : fallback;
}

export function normalizeTimeSignature(
  timeSignature: TimeSignature | undefined,
): TimeSignature {
  return {
    numerator: allowedOrDefault(
      timeSignature?.numerator,
      TIME_SIGNATURE_NUMERATORS,
      DEFAULT_TIME_SIGNATURE.numerator,
    ),
    denominator: allowedOrDefault(
      timeSignature?.denominator,
      TIME_SIGNATURE_DENOMINATORS,
      DEFAULT_TIME_SIGNATURE.denominator,
    ),
  };
}

export function beatsPerBarForTimeSignature(
  timeSignature: TimeSignature | undefined,
): number {
  const normalized = normalizeTimeSignature(timeSignature);
  const beats = normalized.numerator * (4 / normalized.denominator);
  return Number.isFinite(beats) && beats > 0 ? Number(beats.toFixed(6)) : 4;
}

export function beatUnitForTimeSignature(
  timeSignature: TimeSignature | undefined,
): number {
  const normalized = normalizeTimeSignature(timeSignature);
  const beatUnit = 4 / normalized.denominator;
  return Number.isFinite(beatUnit) && beatUnit > 0 ? Number(beatUnit.toFixed(6)) : 1;
}
