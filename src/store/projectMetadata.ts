/** Musical metadata carried in snapshots and undo history (UI-authoritative). */

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
};

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
