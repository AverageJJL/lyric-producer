export type ParsedSectionMarker = {
  name: string;
  startBeat: number;
  endBeat: number;
};

type BeatRange = {startBeat: number; endBeat: number};

const SECTION_NAME = String.raw`([A-Za-z][A-Za-z0-9 &'/_-]{0,48}?)`;
const NUMBER = String.raw`(\d+(?:\.\d+)?)`;
const RANGE_SEPARATOR = String.raw`(?:-|to|through|until|–|—)`;

const finiteBarRange = new RegExp(
  String.raw`^\s*${SECTION_NAME}\s*\(?\s*(?:from\s+)?bars?\s+${NUMBER}\s*${RANGE_SEPARATOR}\s*(?:bars?\s*)?${NUMBER}\b`,
  'i',
);

const restOfSongRange = new RegExp(
  String.raw`^\s*${SECTION_NAME}\s*\(?\s*(?:from\s+)?bars?\s+${NUMBER}\s*${RANGE_SEPARATOR}\s*(?:the\s+)?(?:end|rest)\b`,
  'i',
);

function cleanClause(value: string): string {
  const afterColon = value.includes(':') ? value.slice(value.indexOf(':') + 1) : value;
  return afterColon
    .replace(/^\s*(?:add|create|set)\s+(?:arrangement\s+)?(?:section\s+)?markers?\s*(?:only)?\s*/i, '')
    .replace(/^\s*(?:add|create|set)\s+(?:arrangement\s+)?sections?\s*(?:only)?\s*/i, '')
    .trim();
}

function cleanName(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:the\s+)/i, '')
    .trim();
}

export function barDisplayRangeToBeats(startBar: number, endBar: number, barLength: number): BeatRange | null {
  // Producers usually name the first visible bar "bar 1", but the engine timeline starts at beat 0.
  const startBeat = Math.max(0, startBar - 1) * barLength;
  const endBeat = Math.max(0, endBar) * barLength;
  return Number.isFinite(startBeat) && Number.isFinite(endBeat) && endBeat > startBeat
    ? {startBeat, endBeat}
    : null;
}

function parseClause(clause: string, barLength: number, songEndBeat?: number): ParsedSectionMarker | null {
  const text = cleanClause(clause);
  const rest = text.match(restOfSongRange);
  if (rest) {
    const name = cleanName(rest[1]);
    const startBeat = barDisplayRangeToBeats(Number(rest[2]), Number(rest[2]), barLength)?.startBeat;
    return name && startBeat !== undefined && songEndBeat !== undefined && songEndBeat > startBeat
      ? {name, startBeat, endBeat: songEndBeat}
      : null;
  }

  const finite = text.match(finiteBarRange);
  if (!finite) return null;
  const name = cleanName(finite[1]);
  const range = barDisplayRangeToBeats(Number(finite[2]), Number(finite[3]), barLength);
  return name && range ? {name, ...range} : null;
}

export function parseArrangementSectionMarkers(
  text: string,
  barLength: number,
  songEndBeat?: number,
): ParsedSectionMarker[] {
  return text
    .split(/[,\n;]+/)
    .map(clause => parseClause(clause, barLength, songEndBeat))
    .filter((marker): marker is ParsedSectionMarker => marker !== null);
}
