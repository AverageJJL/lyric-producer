import type {
  SongSeedLyricsSimilarityRequest,
  SongSeedLyricsSimilarityResponse,
  SongSeedTrack,
} from './songSeedTypes';
import {getMusixmatchLyrics, parseMusixmatchSearchPayload} from './songSeedMusixmatch';
import {text, type FetchLike} from './songSeedUtils';

type UserLine = {id: string; text: string; words: string[]; endWord: string; rhymeKey: string};
type Candidate = SongSeedTrack;

function musixmatchKey(env: NodeJS.ProcessEnv): string | undefined {
  return text(env.MUSIXMATCH_API_KEY);
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function endWord(value: string[]): string {
  return value[value.length - 1] ?? '';
}

function rhymeKey(word: string): string {
  const vowelIndex = Math.max(
    word.lastIndexOf('a'),
    word.lastIndexOf('e'),
    word.lastIndexOf('i'),
    word.lastIndexOf('o'),
    word.lastIndexOf('u'),
    word.lastIndexOf('y'),
  );
  const tail = vowelIndex >= 0 ? word.slice(vowelIndex) : word.slice(-3);
  return tail.length >= 2 ? tail : word.slice(-3);
}

function userLines(request: SongSeedLyricsSimilarityRequest): UserLine[] {
  const ids = Array.isArray(request.lineIds) ? request.lineIds : [];
  return (request.lyrics ?? '')
    .split(/\r?\n/)
    .map((line, index) => ({id: ids[index] ?? `line-${index + 1}`, text: line.trim()}))
    .filter(line => line.text.length > 0)
    .map(line => {
      const lineWords = words(line.text);
      const ending = endWord(lineWords);
      return {...line, words: lineWords, endWord: ending, rhymeKey: rhymeKey(ending)};
    })
    .filter(line => line.words.length > 0);
}

function phraseQueries(lines: UserLine[]): string[] {
  const seen = new Set<string>();
  return [...lines]
    .sort((left, right) => right.words.length - left.words.length)
    .slice(0, 6)
    .map(line => line.text.slice(0, 96))
    .filter(phrase => {
      const key = phrase.toLowerCase();
      if (seen.has(key) || words(phrase).length < 4) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

async function searchLyrics(
  query: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
): Promise<Candidate[]> {
  const apiKey = musixmatchKey(env);
  if (!apiKey) return [];
  const url = new URL('https://api.musixmatch.com/ws/1.1/track.search');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('q_lyrics', query);
  url.searchParams.set('f_has_lyrics', '1');
  url.searchParams.set('page_size', '5');
  url.searchParams.set('page', '1');
  url.searchParams.set('s_track_rating', 'desc');
  const response = await fetchImpl(url);
  if (!response.ok) return [];
  return parseMusixmatchSearchPayload(await response.json());
}

function lineScore(user: string[], candidate: string[]): number {
  if (user.length === 0 || candidate.length === 0) return 0;
  const candidateSet = new Set(candidate);
  const shared = user.filter(word => candidateSet.has(word)).length;
  return shared / Math.max(user.length, candidate.length);
}

function longestContiguousUserPhrase(user: string[], candidate: string[]): string {
  let bestStart = 0;
  let bestLength = 0;
  for (let start = 0; start < user.length; start += 1) {
    for (let candidateStart = 0; candidateStart < candidate.length; candidateStart += 1) {
      let length = 0;
      while (
        user[start + length] &&
        candidate[candidateStart + length] &&
        user[start + length] === candidate[candidateStart + length]
      ) {
        length += 1;
      }
      if (length > bestLength) {
        bestStart = start;
        bestLength = length;
      }
    }
  }
  return bestLength >= 3 ? user.slice(bestStart, bestStart + bestLength).join(' ') : '';
}

function scoreCandidate(candidate: Candidate, lyrics: string, lines: UserLine[]) {
  const candidateLines = lyrics.split(/\r?\n/).map(line => words(line)).filter(line => line.length > 0);
  let score = 0;
  let longestOverlap = '';
  const matched = new Set<string>();
  const rhymeMatched = new Set<string>();
  const matchedEndWords = new Set<string>();
  lines.forEach(line => {
    candidateLines.forEach(candidateLine => {
      const nextScore = lineScore(line.words, candidateLine);
      if (nextScore >= 0.58) {
        matched.add(line.id);
      }
      score = Math.max(score, nextScore);
      const phrase = longestContiguousUserPhrase(line.words, candidateLine);
      if (phrase.length > longestOverlap.length) {
        longestOverlap = phrase;
      }
      const candidateEnd = endWord(candidateLine);
      if (line.rhymeKey && rhymeKey(candidateEnd) === line.rhymeKey) {
        rhymeMatched.add(line.id);
        matchedEndWords.add(line.endWord);
      }
    });
  });
  const rhymeScore = lines.length ? rhymeMatched.size / lines.length : 0;
  return {
    candidateId: candidate.id,
    title: candidate.title,
    artist: candidate.artist,
    score: Number(score.toFixed(3)),
    rhymeScore: Number(rhymeScore.toFixed(3)),
    longestOverlap,
    matchedEndWords: [...matchedEndWords].slice(0, 12),
    matchedLineIds: [...matched],
    rhymeMatchedLineIds: [...rhymeMatched],
  };
}

function riskFor(score: number, overlap: string, rhymeScore: number): 'low' | 'medium' | 'high' {
  const overlapWords = words(overlap).length;
  if (score >= 0.78 || overlapWords >= 7) return 'high';
  if (score >= 0.58 || overlapWords >= 4 || rhymeScore >= 0.75) return 'medium';
  return 'low';
}

export async function checkLyricsSimilarity(
  request: SongSeedLyricsSimilarityRequest,
  env = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<SongSeedLyricsSimilarityResponse> {
  const lines = userLines(request);
  if (lines.length === 0) {
    return {ok: false, code: 'empty_query', error: 'Write lyrics before checking similarity.'};
  }
  if (!musixmatchKey(env)) {
    return {ok: false, code: 'missing_key', error: 'MUSIXMATCH_API_KEY is not set.'};
  }
  try {
    const byId = new Map<string, Candidate>();
    for (const query of phraseQueries(lines)) {
      const results = await searchLyrics(query, env, fetchImpl);
      results.forEach(result => byId.set(result.id, result));
    }
    const matches = [];
    for (const candidate of [...byId.values()].slice(0, 8)) {
      const lyrics = await getMusixmatchLyrics({trackId: candidate.id}, env, fetchImpl);
      if (lyrics.ok) {
        matches.push(scoreCandidate(candidate, lyrics.lyrics, lines));
      }
    }
    const ranked = matches
      .filter(match => match.score > 0 || match.longestOverlap.length > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);
    const top = ranked[0];
    return {
      ok: true,
      report: {
        checkedAt: new Date().toISOString(),
        risk: top ? riskFor(top.score, top.longestOverlap, top.rhymeScore) : 'low',
        matches: ranked,
        note: ranked.length
          ? 'Similarity is informational and not a legal copyright judgment.'
          : 'No close lyric matches were found from the configured provider.',
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not check lyric similarity.';
    return {ok: false, code: 'network_error', error: message};
  }
}
