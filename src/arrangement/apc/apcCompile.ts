import type {DAWBlock, DAWTrack} from '../../store/useDAWStore';
import type {DrumPattern} from '../../music/drumPatterns';
import type {TrackAmpSimState} from '../../native/ampSimContract';
import {summarizeTrackFx, type TrackFxState} from '../../native/fxContract';
import {mediaReferencesFromBlocks} from '../mediaReferences';
import {normalizeSnapshot} from '../snapshotNormalize';
import {emptyProjectSnapshot, type ProjectSnapshot} from '../projectSnapshot';
import {isFatalApcIssue, validateApcSource} from './apcValidation';
import type {ApcCompileResult, ApcSourceProject} from './apcSourceTypes';

/**
 * Reassemble a {@link ProjectSnapshot} from the `.apc` tree.
 *
 * Correctness contract: for any snapshot S produced by `captureProjectSnapshot()`,
 * `compileApcSourceToSnapshot(decomposeSnapshotToApcSource(S, t))` yields a snapshot
 * with the SAME `snapshotFingerprint(S)`. This holds because (a) every persisted
 * field is restored from its file, (b) the two derived fields (`mediaReferences`,
 * `fxSummaries`) are regenerated from the same helpers capture uses, and (c) the
 * result is run through the shared `normalizeSnapshot` — the exact normalizer the
 * old document-open path used, whose idempotence on captured snapshots is already
 * locked down by projectSnapshotRoundTrip.test.ts.
 */
export function compileApcSourceToSnapshot(source: ApcSourceProject): ApcCompileResult {
  const issues = validateApcSource(source);
  const errors = issues.filter(isFatalApcIssue);
  if (errors.length > 0) {
    return {ok: false, errors};
  }
  const warnings = issues.filter(issue => !isFatalApcIssue(issue));

  // Manifest arrays own ordering — never object-key or filesystem order.
  const tracks = source.manifest.trackIds
    .map(id => source.tracks[id])
    .filter((track): track is DAWTrack => Boolean(track));
  const blocks = source.manifest.clipIds
    .map(id => source.clips[id])
    .filter((block): block is DAWBlock => Boolean(block));
  const patterns: Record<string, DrumPattern> = {...source.patterns};

  const fxStates = source.manifest.fxTrackIds
    .map(id => source.fx[id]?.fx)
    .filter((state): state is TrackFxState => Boolean(state));

  // Amp-sim states follow track order (matching captureProjectSnapshot, which maps
  // over voice tracks in order) so the resulting array — and its fingerprint — is
  // identical to the original capture.
  const ampSimStates: TrackAmpSimState[] = [];
  source.manifest.trackIds.forEach(id => {
    const ampSim = source.fx[id]?.ampSim;
    if (ampSim) {
      ampSimStates.push(ampSim);
    }
  });

  const assembled: ProjectSnapshot = {
    // emptyProjectSnapshot is a safety net: every snapshot field is then explicitly
    // overridden below, but if a future field is forgotten the round-trip test fails
    // loudly rather than emitting an undefined.
    ...emptyProjectSnapshot(),
    ...source.project,
    ...source.timeline,
    lyrics: source.lyrics,
    tracks,
    blocks,
    patterns,
    fxStates,
    ampSimStates,
    copilotChats: source.copilot,
    mediaReferences: mediaReferencesFromBlocks(blocks),
    fxSummaries: fxStates.map(summarizeTrackFx),
  };

  return {ok: true, snapshot: normalizeSnapshot(assembled), warnings};
}
