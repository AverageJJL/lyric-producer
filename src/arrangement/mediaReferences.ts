import type {DAWBlock} from '../store/useDAWStore';
import type {ProjectMediaReference} from './projectSnapshot';

/**
 * Derive the canonical audio media inventory from arrangement blocks.
 *
 * Why this lives in its own module: both the runtime snapshot capture
 * (projectSnapshot.ts) and the on-disk `.apc` source compiler need the EXACT
 * same derivation. If the two ever diverged, a project's media references would
 * drift between what plays in the engine and what is written to
 * `assets/manifest.json`. This was previously duplicated in projectSnapshot.ts
 * and projectDocument.ts; centralizing it keeps every consumer in lockstep.
 */
export function mediaReferencesFromBlocks(blocks: DAWBlock[]): ProjectMediaReference[] {
  return blocks
    .filter(
      block =>
        block.type === 'audio' && (block.audioFilePath || block.absoluteAudioFilePath),
    )
    .map(block => ({
      clipId: block.id,
      trackId: block.trackId,
      kind: 'audio' as const,
      name: block.mediaSourceName ?? block.name,
      relativePath: block.audioFilePath,
      absolutePath: block.absoluteAudioFilePath,
    }));
}
