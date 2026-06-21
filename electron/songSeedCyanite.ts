import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  SongSeedReferenceAnalyzeResponse,
  SongSeedReferenceErrorCode,
} from './songSeedTypes';
export {CYANITE_ANALYSIS_FIELDS} from './songSeedCyaniteFields';
import {CYANITE_ANALYSIS_FIELDS} from './songSeedCyaniteFields';
import {envTimeoutMs, text, type FetchLike, withTimeout} from './songSeedUtils';
import {cyaniteAnalysisStatus} from './songSeedCyaniteNormalize';

type AnalyzeFileRequest = {
  filePath?: string;
  title?: string;
};

export type CyaniteOptions = {
  pollIntervalMs?: number;
  timeoutMs?: number;
};

type FetchInitWithDuplex = RequestInit & {duplex?: 'half'};

const DEFAULT_API_BASE_URL = 'https://api.cyanite.ai/graphql';
const CYANITE_TIMEOUT_MS = 120000;
const CYANITE_POLL_INTERVAL_MS = 2400;

export class CyaniteError extends Error {
  constructor(readonly code: SongSeedReferenceErrorCode, message: string) {
    super(message);
  }
}

function apiUrl(env: NodeJS.ProcessEnv): string {
  return text(env.CYANITE_API_BASE_URL) ?? DEFAULT_API_BASE_URL;
}

function titleForUpload(filePath: string, title?: string): string {
  const fallback = path.basename(filePath, path.extname(filePath));
  return (text(title) ?? fallback).slice(0, 150);
}

export function isCyaniteMp3Path(filePath: string | undefined): boolean {
  return path.extname(filePath ?? '').toLowerCase() === '.mp3';
}

export function cyaniteMapError(message: string): SongSeedReferenceErrorCode {
  const lower = message.toLowerCase();
  if (lower.includes('authorized') || lower.includes('unauthorized')) return 'unauthorized';
  if (lower.includes('rate')) return 'rate_limited';
  if (lower.includes('limit') || lower.includes('credit')) return 'limit_exceeded';
  if (lower.includes('duration') || lower.includes('invalidyoutubelink') || lower.includes('invalid youtube')) return 'invalid_file';
  if (lower.includes('timeout')) return 'timeout';
  return 'network_error';
}

export function cyanitePollOptions(env: NodeJS.ProcessEnv, options: CyaniteOptions = {}) {
  return {
    timeoutMs: options.timeoutMs ?? envTimeoutMs(env, 'CYANITE_TIMEOUT_MS', CYANITE_TIMEOUT_MS),
    pollIntervalMs: options.pollIntervalMs ?? envTimeoutMs(env, 'CYANITE_POLL_INTERVAL_MS', CYANITE_POLL_INTERVAL_MS),
  };
}

async function sha256ForFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

export async function cyaniteGraphql<T>(
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = text(env.CYANITE_ACCESS_TOKEN);
  if (!token) {
    throw new CyaniteError('missing_key', 'CYANITE_ACCESS_TOKEN is not set.');
  }
  const response = await fetchImpl(apiUrl(env), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({query, variables}),
  });
  if (!response.ok) {
    const code = response.status === 401 ? 'unauthorized' : response.status === 402 ? 'limit_exceeded' : response.status === 429 ? 'rate_limited' : 'network_error';
    throw new CyaniteError(code, `Cyanite returned ${response.status}.`);
  }
  const payload = await response.json() as {data?: T; errors?: Array<{message?: string}>};
  const error = payload.errors?.map(item => item.message).filter(Boolean).join('; ');
  if (error) {
    throw new CyaniteError(cyaniteMapError(error), error);
  }
  if (!payload.data) {
    throw new CyaniteError('network_error', 'Cyanite returned an empty response.');
  }
  return payload.data;
}

async function findLibraryTrackByHash(
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
  sha256: string,
): Promise<Record<string, unknown> | null> {
  const data = await cyaniteGraphql<{libraryTracks?: {edges?: Array<{node?: Record<string, unknown>}>}}>(env, fetchImpl, `
    query CyaniteLibraryTrackByHash($sha256: String!) {
      libraryTracks(filter: { sha256: $sha256 }, first: 1) {
        edges { node { id title audioAnalysisV7 { ${CYANITE_ANALYSIS_FIELDS} } } }
      }
    }
  `, {sha256});
  return data.libraryTracks?.edges?.[0]?.node ?? null;
}

async function requestUpload(env: NodeJS.ProcessEnv, fetchImpl: FetchLike) {
  const data = await cyaniteGraphql<{fileUploadRequest: {id: string; uploadUrl: string}}>(env, fetchImpl, `
    mutation CyaniteFileUploadRequest { fileUploadRequest { id uploadUrl } }
  `);
  return data.fileUploadRequest;
}

async function uploadMp3(uploadUrl: string, filePath: string, fetchImpl: FetchLike): Promise<void> {
  // Stream bytes to Cyanite without decoding, inspecting, or buffering audio in JS.
  const response = await fetchImpl(uploadUrl, {
    method: 'PUT',
    headers: {'Content-Type': 'audio/mpeg'},
    body: fs.createReadStream(filePath) as unknown as BodyInit,
    duplex: 'half',
  } as FetchInitWithDuplex);
  if (!response.ok) {
    throw new CyaniteError('network_error', `Cyanite file upload failed (${response.status}).`);
  }
}

async function createLibraryTrack(
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
  input: {uploadId: string; title: string; externalId: string},
): Promise<string> {
  const data = await cyaniteGraphql<{libraryTrackCreate: Record<string, unknown>}>(env, fetchImpl, `
    mutation CyaniteLibraryTrackCreate($input: LibraryTrackCreateInput!) {
      libraryTrackCreate(input: $input) {
        __typename
        ... on LibraryTrackCreateSuccess { createdLibraryTrack { id } }
        ... on LibraryTrackCreateError { code message }
      }
    }
  `, {input});
  const result = data.libraryTrackCreate;
  if (result.__typename === 'LibraryTrackCreateSuccess') {
    const track = result.createdLibraryTrack as Record<string, unknown> | undefined;
    const id = text(track?.id);
    if (id) return id;
  }
  throw new CyaniteError(cyaniteMapError(String(result.message ?? result.code ?? 'creation failed')), String(result.message ?? 'Cyanite could not create the library track.'));
}

export async function getCyaniteLibraryTrack(
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
  id: string,
): Promise<Record<string, unknown>> {
  const data = await cyaniteGraphql<{libraryTrack: Record<string, unknown>}>(env, fetchImpl, `
    query CyaniteLibraryTrack($id: ID!) {
      libraryTrack(id: $id) {
        __typename
        ... on LibraryTrack { id title audioAnalysisV7 { ${CYANITE_ANALYSIS_FIELDS} } }
        ... on LibraryTrackNotFoundError { message }
      }
    }
  `, {id});
  if (data.libraryTrack.__typename !== 'LibraryTrack') {
    throw new CyaniteError('not_found', String(data.libraryTrack.message ?? 'Cyanite library track was not found.'));
  }
  return data.libraryTrack;
}

export async function pollCyaniteAnalysis(
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
  id: string,
  options: Required<CyaniteOptions>,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const status = cyaniteAnalysisStatus(await getCyaniteLibraryTrack(env, fetchImpl, id));
    if (status.status === 'finished') return status.analysis;
    if (status.status === 'failed') throw new CyaniteError('analysis_failed', status.error);
    await new Promise(resolve => setTimeout(resolve, options.pollIntervalMs));
  }
  throw new CyaniteError('timeout', 'Cyanite analysis timed out.');
}

export async function analyzeCyaniteReferenceFile(
  request: AnalyzeFileRequest,
  env = process.env,
  fetchImpl: FetchLike = fetch,
  options: CyaniteOptions = {},
): Promise<SongSeedReferenceAnalyzeResponse> {
  const filePath = text(request.filePath);
  if (!filePath) return {ok: false, code: 'invalid_file', error: 'Choose a reference MP3 first.'};
  if (!isCyaniteMp3Path(filePath)) {
    return {ok: false, code: 'invalid_file', error: 'Cyanite reference analysis supports MP3 files only.'};
  }
  const pollOptions = cyanitePollOptions(env, options);
  try {
    return await withTimeout((async () => {
      const sha256 = await sha256ForFile(filePath);
      const existing = await findLibraryTrackByHash(env, fetchImpl, sha256);
      const existingStatus = existing ? cyaniteAnalysisStatus(existing) : null;
      if (existingStatus?.status === 'finished') return {ok: true as const, analysis: existingStatus.analysis};
      const trackId = existing
        ? text(existing.id) ?? ''
        : await (async () => {
          const upload = await requestUpload(env, fetchImpl);
          await uploadMp3(upload.uploadUrl, filePath, fetchImpl);
          return createLibraryTrack(env, fetchImpl, {
            uploadId: upload.id,
            title: titleForUpload(filePath, request.title),
            externalId: `apc-cyanite-${sha256}`.slice(0, 150),
          });
        })();
      return {ok: true as const, analysis: await pollCyaniteAnalysis(env, fetchImpl, trackId, pollOptions)};
    })(), pollOptions.timeoutMs + 1000, 'Cyanite analysis timed out.');
  } catch (error) {
    if (error instanceof CyaniteError) return {ok: false, code: error.code, error: error.message};
    const message = error instanceof Error ? error.message : 'Cyanite reference analysis failed.';
    return {ok: false, code: cyaniteMapError(message), error: message};
  }
}
