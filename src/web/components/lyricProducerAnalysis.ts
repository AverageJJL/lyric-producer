export type LyricRhymeKind = 'exact' | 'slant' | 'context' | 'none';

export type LyricProducerLineAnalysis = {
  id?: string;
  text: string;
  syllables: number;
  endWord: string;
  rhymeLabel: string;
  rhymeKind: LyricRhymeKind;
  contextSectionName?: string;
};

export type LyricProducerSectionAnalysis = {
  sectionName: string;
  lineCount: number;
  totalSyllables: number;
  averageSyllables: number;
  rhymeScheme: string;
  rhymeDensity: number;
  lines: LyricProducerLineAnalysis[];
  flags: string[];
  cues: string[];
};

export type LyricProducerLineInput = {
  id?: string;
  text: string;
};

export type LyricProducerContextSection = {
  sectionName: string;
  lines: LyricProducerLineInput[];
};

const VOWEL_RUN = /[aeiouy]+/g;
const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function cleanWord(value: string): string {
  return value.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '');
}

function words(value: string): string[] {
  return value.split(/\s+/).map(cleanWord).filter(Boolean);
}

function endWord(value: string): string {
  const parts = words(value.replace(/\s*\([^)]*\)\s*$/g, ''));
  return parts[parts.length - 1] ?? '';
}

export function estimateLyricSyllables(value: string): number {
  const count = words(value).reduce((sum, word) => {
    if (word.length <= 3) return sum + 1;
    const withoutSilentE = word.replace(/e$/, '');
    const runs = withoutSilentE.match(VOWEL_RUN)?.length ?? 1;
    return sum + Math.max(1, runs);
  }, 0);
  return Math.max(value.trim() ? 1 : 0, count);
}

function exactRhymeKey(word: string): string {
  if (!word) return '';
  if (word.length <= 3) return `same:${word}`;
  const commonRime = word.match(/(ight|one|own|art|ore|ell|ound)$/);
  if (commonRime) return `rime:${commonRime[1]}`;
  const vowelIndex = Math.max(
    word.lastIndexOf('a'),
    word.lastIndexOf('e'),
    word.lastIndexOf('i'),
    word.lastIndexOf('o'),
    word.lastIndexOf('u'),
    word.lastIndexOf('y'),
  );
  const tail = vowelIndex >= 0 ? word.slice(vowelIndex) : word.slice(-3);
  return tail.length >= 3 ? tail : '';
}

function slantRhymeKey(word: string): string {
  if (!word) return '';
  if (/(eyes|ies|igh|ight|ime|ine|ide|ize|ise|y)$/.test(word)) return 'long-i';
  if (/(ain|ane|ay|ey|eigh)$/.test(word)) return 'long-a';
  if (/(own|one|oa|ow)$/.test(word)) return 'long-o';
  if (/(art|ard)$/.test(word)) return 'art';
  const match = word.match(/[aeiouy][a-z]{0,2}$/);
  return match?.[0] ?? word.slice(-2);
}

function labelFor(index: number): string {
  return LABELS[index] ?? `R${index + 1}`;
}

function groupedIndexes<T>(
  items: T[],
  keyFor: (item: T) => string,
): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const key = keyFor(item);
    if (key) groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return groups;
}

function cadenceFlags(lines: LyricProducerLineAnalysis[], sectionName: string): string[] {
  const flags = new Set<string>();
  const syllables = lines.map(line => line.syllables).filter(count => count > 0);
  const average = syllables.reduce((sum, count) => sum + count, 0) / Math.max(1, syllables.length);
  if (/chorus|hook/i.test(sectionName) && syllables.length > 0 && average <= 6) {
    flags.add('short hook');
  }
  if (syllables.some(count => count >= 16)) {
    flags.add('dense line');
  }
  if (syllables.length >= 3 && Math.max(...syllables) - Math.min(...syllables) >= 8) {
    flags.add('uneven cadence');
  }
  const rhymed = lines.filter(line => line.rhymeLabel !== '-').length;
  if (lines.length >= 4 && rhymed / lines.length < 0.4) {
    flags.add('loose rhyme');
  }
  return [...flags];
}

function producerCues(flags: string[], rhymeDensity: number, averageSyllables: number): string[] {
  const cues = [];
  if (flags.includes('dense line')) {
    cues.push('Leave drums and bass simpler under the busiest lyric lines.');
  }
  if (flags.includes('uneven cadence')) {
    cues.push('Sketch the melody line-by-line instead of looping one phrase shape.');
  }
  if (flags.includes('short hook')) {
    cues.push('Use repeats, doubles, or a response part to make the hook feel wider.');
  }
  if (rhymeDensity >= 0.7) {
    cues.push('Let the rhyme land on strong beats; it already gives the section glue.');
  } else {
    cues.push('Use a stronger melodic motif or instrumental answer to connect the lines.');
  }
  if (averageSyllables >= 12) {
    cues.push('Keep the top-line rhythm conversational and avoid over-harmonizing every word.');
  }
  return cues.slice(0, 3);
}

export function analyzeLyricProducerSection(input: {
  sectionName: string;
  lines: LyricProducerLineInput[];
  context?: LyricProducerContextSection[];
}): LyricProducerSectionAnalysis {
  const rawLines = input.lines.map(line => ({...line, text: line.text.trim()})).filter(line => line.text);
  const records = rawLines.map(line => {
    const ending = endWord(line.text);
    return {
      line,
      ending,
      exactKey: exactRhymeKey(ending),
      slantKey: slantRhymeKey(ending),
    };
  });
  const contextRecords = (input.context ?? []).flatMap(section => section.lines.map(line => {
    const ending = endWord(line.text);
    return {
      sectionName: section.sectionName,
      exactKey: exactRhymeKey(ending),
      slantKey: slantRhymeKey(ending),
    };
  }));
  let labelIndex = 0;
  const exactLabels = new Map<string, string>();
  const slantLabels = new Map<string, string>();
  groupedIndexes(records, item => item.exactKey).forEach((indexes, key) => {
    if (indexes.length > 1) exactLabels.set(key, labelFor(labelIndex++));
  });
  groupedIndexes(records, item => item.slantKey).forEach((indexes, key) => {
    if (indexes.length > 1 && !indexes.some(index => exactLabels.has(records[index].exactKey))) {
      slantLabels.set(key, labelFor(labelIndex++));
    }
  });
  const contextLabels = new Map<string, string>();
  const lines = records.map(record => {
    const exactLabel = exactLabels.get(record.exactKey);
    const slantLabel = slantLabels.get(record.slantKey);
    const contextMatch = !exactLabel && !slantLabel
      ? contextRecords.find(item => (
        Boolean(record.exactKey) && item.exactKey === record.exactKey
      ) || (
        Boolean(record.slantKey) && item.slantKey === record.slantKey
      ))
      : undefined;
    const matchedContextKey = contextMatch?.exactKey === record.exactKey && record.exactKey
      ? `exact:${record.exactKey}`
      : contextMatch ? `slant:${record.slantKey}` : '';
    if (contextMatch && !contextLabels.has(matchedContextKey)) contextLabels.set(matchedContextKey, labelFor(labelIndex++));
    const rhymeKind: LyricRhymeKind = exactLabel ? 'exact' : slantLabel ? 'slant' : contextMatch ? 'context' : 'none';
    return {
      id: record.line.id,
      text: record.line.text,
      syllables: estimateLyricSyllables(record.line.text),
      endWord: record.ending,
      rhymeLabel: exactLabel ?? slantLabel ?? (matchedContextKey ? contextLabels.get(matchedContextKey) : undefined) ?? '-',
      rhymeKind,
      contextSectionName: contextMatch?.sectionName,
    };
  });
  const totalSyllables = lines.reduce((sum, line) => sum + line.syllables, 0);
  const averageSyllables = lines.length ? totalSyllables / lines.length : 0;
  const rhymedLines = lines.filter(line => line.rhymeLabel !== '-').length;
  const rhymeDensity = lines.length ? rhymedLines / lines.length : 0;
  const flags = cadenceFlags(lines, input.sectionName);
  return {
    sectionName: input.sectionName,
    lineCount: lines.length,
    totalSyllables,
    averageSyllables: Number(averageSyllables.toFixed(1)),
    rhymeScheme: lines.map(line => line.rhymeLabel).join(' '),
    rhymeDensity: Number(rhymeDensity.toFixed(2)),
    lines,
    flags,
    cues: producerCues(flags, rhymeDensity, averageSyllables),
  };
}
