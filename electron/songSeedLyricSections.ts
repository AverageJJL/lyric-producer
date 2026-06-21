import type {SongSeedLyricStructure, SongSeedLyricStructureRole} from './songSeedTypes';

export type LyricSectionSource = 'musixmatch-structure' | 'lyric-headers' | 'repetition' | 'model' | 'fallback-template';

export type ParsedLyricSection = {
  name: string;
  bars: number;
  hook: boolean;
  startLine: number;
  endLine: number;
  lyrics: string[];
  sectionSource: LyricSectionSource;
  sectionConfidence: number;
};

const HEADER = /^\s*\[([^\]]+)\]\s*$/;
const ADLIB_WORDS = new Set(['oh', 'ooh', 'whoa', 'woah', 'yeah', 'yo', 'uh', 'huh', 'ah', 'hey']);
const SOFT_REPEAT_WORDS = new Set(['and', 'be', 'ever', 'i', 'it', 'me', 'my', 'the', 'to', 'we', 'you']);
const STRUCTURE_MIN_COVERAGE = 0.6;
const STRUCTURE_ROLES: Array<{role: SongSeedLyricStructureRole; base: string; hook: boolean}> = [
  {role: 'intro', base: 'Intro', hook: false},
  {role: 'verse', base: 'Verse', hook: false},
  {role: 'pre-chorus', base: 'Pre-Chorus', hook: false},
  {role: 'chorus', base: 'Chorus', hook: true},
  {role: 'hook', base: 'Hook', hook: true},
  {role: 'bridge', base: 'Bridge', hook: false},
  {role: 'outro', base: 'Outro', hook: false},
];

function cleanLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function lyricContentLines(value: string | undefined): string[] {
  return (value ?? '').split(/\r?\n/).map(cleanLine)
    .filter(line => line.length > 0 && !line.startsWith('*******') && !HEADER.test(line));
}

function roleFromHeader(value: string): {base: string; hook: boolean} | null {
  const lower = value.toLowerCase();
  if (lower.includes('pre') && lower.includes('chorus')) return {base: 'Pre-Chorus', hook: false};
  if (lower.includes('chorus') || lower.includes('hook') || lower.includes('refrain')) return {base: 'Chorus', hook: true};
  if (lower.includes('verse')) return {base: 'Verse', hook: false};
  if (lower.includes('bridge')) return {base: 'Bridge', hook: false};
  if (lower.includes('intro')) return {base: 'Intro', hook: false};
  if (lower.includes('outro')) return {base: 'Outro', hook: false};
  return null;
}

function named(base: string, counts: Map<string, number>): string {
  const next = (counts.get(base) ?? 0) + 1;
  counts.set(base, next);
  return ['Verse', 'Pre-Chorus', 'Chorus', 'Hook'].includes(base) ? `${base} ${next}` : base;
}

function barsFor(name: string, lineCount: number, hook: boolean): number {
  if (/intro|outro/i.test(name)) return 4;
  if (hook) return 8;
  return Math.max(4, Math.min(16, Math.ceil(Math.max(1, lineCount) / 2) * 2));
}

function section(
  name: string,
  hook: boolean,
  startLine: number,
  endLine: number,
  lines: string[],
  source: LyricSectionSource,
  confidence: number,
): ParsedLyricSection | null {
  if (endLine < startLine) return null;
  const lyrics = lines.slice(startLine, endLine + 1);
  return {name, hook, startLine, endLine, lyrics, bars: barsFor(name, lyrics.length, hook), sectionSource: source, sectionConfidence: confidence};
}

function headerSections(rawLyrics: string | undefined, lines: string[]): ParsedLyricSection[] {
  const counts = new Map<string, number>();
  const sections: ParsedLyricSection[] = [];
  let current: {name: string; hook: boolean; startLine: number} | null = null;
  let lyricIndex = 0;
  for (const raw of (rawLyrics ?? '').split(/\r?\n/)) {
    const line = cleanLine(raw);
    if (!line || line.startsWith('*******')) continue;
    const header = line.match(HEADER);
    if (header) {
      if (current) {
        const parsed = section(current.name, current.hook, current.startLine, lyricIndex - 1, lines, 'lyric-headers', 0.98);
        if (parsed) sections.push(parsed);
      } else if (sections.length === 0 && lyricIndex > 0) {
        const intro = section('Intro', false, 0, lyricIndex - 1, lines, 'lyric-headers', 0.92);
        if (intro) sections.push(intro);
      }
      const role = roleFromHeader(header[1] ?? '');
      current = role ? {name: named(role.base, counts), hook: role.hook, startLine: lyricIndex} : null;
      continue;
    }
    if (current === null && sections.length > 0) current = {name: named('Verse', counts), hook: false, startLine: lyricIndex};
    lyricIndex += 1;
  }
  if (current) {
    const parsed = section(current.name, current.hook, current.startLine, lyricIndex - 1, lines, 'lyric-headers', 0.98);
    if (parsed) sections.push(parsed);
  }
  return sections;
}

function structureRole(role: SongSeedLyricStructureRole) {
  return STRUCTURE_ROLES.find(item => item.role === role);
}

function nextKnownRole(index: number, rolesByLine: Array<SongSeedLyricStructureRole | undefined>) {
  for (let cursor = index + 1; cursor < rolesByLine.length; cursor += 1) {
    if (rolesByLine[cursor]) return rolesByLine[cursor];
  }
  return undefined;
}

function normalizedStructureRoles(
  lineCount: number,
  structure: SongSeedLyricStructure | undefined,
): Array<SongSeedLyricStructureRole | undefined> {
  const rolesByLine: Array<SongSeedLyricStructureRole | undefined> = Array.from({length: lineCount});
  STRUCTURE_ROLES.forEach(({role}) => {
    (structure?.[role] ?? []).forEach(index => {
      if (index >= 0 && index < lineCount && rolesByLine[index] === undefined) {
        rolesByLine[index] = role;
      }
    });
  });
  const covered = rolesByLine.filter(Boolean).length;
  if (lineCount === 0 || covered / lineCount < STRUCTURE_MIN_COVERAGE) return [];
  let previous: SongSeedLyricStructureRole | undefined;
  return rolesByLine.map((role, index) => {
    previous = role ?? previous ?? nextKnownRole(index, rolesByLine);
    return previous;
  });
}

function structureSections(
  lines: string[],
  structure: SongSeedLyricStructure | undefined,
): ParsedLyricSection[] {
  const rolesByLine = normalizedStructureRoles(lines.length, structure);
  if (rolesByLine.length === 0 || !rolesByLine[0]) return [];
  const counts = new Map<string, number>();
  const sections: ParsedLyricSection[] = [];
  let role: SongSeedLyricStructureRole | undefined = rolesByLine[0];
  let start = 0;
  for (let index = 1; index <= rolesByLine.length; index += 1) {
    if (rolesByLine[index] === role) continue;
    const meta = role ? structureRole(role) : undefined;
    if (meta) {
      const parsed = section(
        named(meta.base, counts),
        meta.hook,
        start,
        index - 1,
        lines,
        'musixmatch-structure',
        0.99,
      );
      if (parsed) sections.push(parsed);
    }
    role = rolesByLine[index];
    start = index;
  }
  return sections;
}

function rhymeText(value: string): string {
  return value.replace(/\([^)]*\)\s*$/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function words(value: string): string[] {
  return rhymeText(value).split(/\s+/).filter(Boolean);
}

function isAdlib(value: string): boolean {
  const lineWords = words(value);
  return lineWords.length > 0 && lineWords.every(word => ADLIB_WORDS.has(word));
}

function dominantHookWord(lineWords: string[]): string | undefined {
  if (lineWords.length === 0 || lineWords.length > 6) return undefined;
  const byWord = new Map<string, number>();
  lineWords.forEach(word => byWord.set(word, (byWord.get(word) ?? 0) + 1));
  return [...byWord.entries()].find(([word, count]) => (
    count >= 2 && !SOFT_REPEAT_WORDS.has(word) && count / lineWords.length >= 0.45
  ))?.[0];
}

function isRepeatedHookLine(value: string, counts: Map<string, number>, dominantCounts: Map<string, number>): boolean {
  const normalized = rhymeText(value);
  const lineWords = words(value).filter(word => !ADLIB_WORDS.has(word));
  const dominant = dominantHookWord(lineWords);
  return Boolean(dominant && (dominantCounts.get(dominant) ?? 0) >= 2)
    || (counts.get(normalized) ?? 0) >= 2 && lineWords.length <= 10;
}

function hookGroups(lines: string[]): Array<{start: number; end: number}> {
  const counts = new Map<string, number>();
  lines.map(rhymeText).forEach(line => counts.set(line, (counts.get(line) ?? 0) + 1));
  const dominantCounts = new Map<string, number>();
  lines.map(line => dominantHookWord(words(line).filter(word => !ADLIB_WORDS.has(word))))
    .filter((word): word is string => Boolean(word))
    .forEach(word => dominantCounts.set(word, (dominantCounts.get(word) ?? 0) + 1));
  const groups: Array<{start: number; end: number}> = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!isRepeatedHookLine(lines[index] ?? '', counts, dominantCounts)) continue;
    let end = index;
    while (end + 1 < lines.length && end - index < 7) {
      const next = lines[end + 1] ?? '';
      if (isRepeatedHookLine(next, counts, dominantCounts)) {
        end += 1;
      } else break;
    }
    groups.push({start: index, end});
    index = end;
  }
  return groups;
}

function groupIsAdlib(lines: string[], group: {start: number; end: number}): boolean {
  return lines.slice(group.start, group.end + 1).every(isAdlib);
}

function addVerse(sections: ParsedLyricSection[], counts: Map<string, number>, start: number, end: number, lines: string[]) {
  const parsed = section(named('Verse', counts), false, start, end, lines, 'repetition', 0.82);
  if (parsed) sections.push(parsed);
}

function repeatedSections(lines: string[]): ParsedLyricSection[] {
  const groups = hookGroups(lines);
  if (groups.length === 0) return [];
  const counts = new Map<string, number>();
  const sections: ParsedLyricSection[] = [];
  let cursor = 0;
  groups.forEach(group => {
    if (group.start === 0 && cursor === 0 && groupIsAdlib(lines, group)) {
      const intro = section('Intro', false, group.start, group.end, lines, 'repetition', 0.86);
      if (intro) sections.push(intro);
      cursor = group.end + 1;
      return;
    }
    if (group.start > cursor) {
      if (sections.length === 0 && lines.slice(0, group.start).every(isAdlib)) {
        const intro = section('Intro', false, 0, group.start - 1, lines, 'repetition', 0.8);
        if (intro) sections.push(intro);
      } else {
        addVerse(sections, counts, cursor, group.start - 1, lines);
      }
    }
    const chorus = section(named('Chorus', counts), true, group.start, group.end, lines, 'repetition', 0.9);
    if (chorus) sections.push(chorus);
    cursor = group.end + 1;
  });
  if (cursor < lines.length) addVerse(sections, counts, cursor, lines.length - 1, lines);
  return sections;
}

export function parseLyricSections(
  rawLyrics: string | undefined,
  structure?: SongSeedLyricStructure,
): {lines: string[]; sections: ParsedLyricSection[]} {
  const lines = lyricContentLines(rawLyrics);
  const fromStructure = structureSections(lines, structure);
  if (fromStructure.length) return {lines, sections: fromStructure};
  const fromHeaders = headerSections(rawLyrics, lines);
  return {lines, sections: fromHeaders.length ? fromHeaders : repeatedSections(lines)};
}
