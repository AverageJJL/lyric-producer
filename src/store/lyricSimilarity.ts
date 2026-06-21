export type LyricSimilarityRisk = 'low' | 'medium' | 'high' | 'unavailable';

export type LyricSimilarityMatch = {
  candidateId: string;
  title: string;
  artist?: string;
  score: number;
  rhymeScore?: number;
  longestOverlap: string;
  matchedEndWords?: string[];
  matchedLineIds: string[];
  rhymeMatchedLineIds?: string[];
};

export type LyricSimilarityReport = {
  checkedAt: string;
  risk: LyricSimilarityRisk;
  matches: LyricSimilarityMatch[];
  note?: string;
};

function stringArray(value: unknown, limit: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string').slice(0, limit);
}

export function normalizeLyricSimilarityReport(value: unknown): LyricSimilarityReport | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<LyricSimilarityReport>;
  const risk = raw.risk === 'low' || raw.risk === 'medium' || raw.risk === 'high'
    ? raw.risk
    : 'unavailable';
  return {
    checkedAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : new Date(0).toISOString(),
    risk,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 240) : undefined,
    matches: Array.isArray(raw.matches) ? raw.matches.slice(0, 5).map((match, index) => {
      const item = match as Partial<LyricSimilarityMatch>;
      return {
        candidateId: typeof item.candidateId === 'string' ? item.candidateId : `match-${index}`,
        title: typeof item.title === 'string' ? item.title.slice(0, 120) : 'Unknown song',
        artist: typeof item.artist === 'string' ? item.artist.slice(0, 120) : undefined,
        score: typeof item.score === 'number' ? Math.max(0, Math.min(1, item.score)) : 0,
        rhymeScore: typeof item.rhymeScore === 'number' ? Math.max(0, Math.min(1, item.rhymeScore)) : undefined,
        longestOverlap: typeof item.longestOverlap === 'string' ? item.longestOverlap.slice(0, 120) : '',
        matchedEndWords: stringArray(item.matchedEndWords, 12)?.map(word => word.slice(0, 32)),
        matchedLineIds: stringArray(item.matchedLineIds, 12) ?? [],
        rhymeMatchedLineIds: stringArray(item.rhymeMatchedLineIds, 12),
      };
    }) : [],
  };
}
