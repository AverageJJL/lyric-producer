import React from 'react';

import {
  AUDIO_CROSSFADE_BEATS,
  canCrossfadeAudioClips,
  crossfadeSelectedAudioClips,
} from '../../arrangement/audioClipCrossfadeCommands';
import {renderSelectedAudioClipsInPlace} from '../../arrangement/audioClipRenderInPlace';
import {
  AUDIO_CLIP_GAIN_STEP_DB,
  AUDIO_FADE_STEP_BEATS,
  AUDIO_SLIDE_STEP_BEATS,
  AUDIO_SLIP_STEP_BEATS,
  AUDIO_TRIM_STEP_BEATS,
  MAX_AUDIO_CLIP_GAIN_DB,
  MIN_AUDIO_CLIP_GAIN_DB,
  canNormalizeAudioClip,
  clampAudioFadeBeats,
  maxAudioSourceOffset,
  normalizeAudioClipGain,
  nudgeAudioClipGainDb,
  nudgeAudioClipFade,
  nudgeAudioClipSlide,
  nudgeAudioClipSourceOffset,
  nudgeAudioClipTrimEnd,
  nudgeAudioClipTrimStart,
  toggleAudioClipReverse,
} from '../../arrangement/audioClipEditCommands';
import {isDrumPatternBlock} from '../../music/clipFactories';
import {getMediaImportBridge} from '../../native/mediaImportApi';
import {useDAWStore} from '../../store/useDAWStore';
import {ClipContent} from './ClipContent';

type AudioClipEditorPanelProps = {
  blockId: string;
  trackName: string;
};

function beatLabel(value: number | undefined): string {
  return `${Math.max(0, value ?? 0).toFixed(2)} beats`;
}

function dbLabel(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;
}

function peakLabel(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? `${Math.round(value * 100)}% peak`
    : 'Peak unavailable';
}

export function AudioClipEditorPanel({blockId, trackName}: AudioClipEditorPanelProps) {
  const [renderStatus, setRenderStatus] = React.useState<string | null>(null);
  const [renderStatusKind, setRenderStatusKind] = React.useState<'ok' | 'error' | null>(null);
  const [isRendering, setIsRendering] = React.useState(false);
  const previewRef = React.useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = React.useState(720);
  const blocks = useDAWStore(state => state.blocks);
  const tracks = useDAWStore(state => state.tracks);
  const selectedBlockIds = useDAWStore(state => state.selectedBlockIds);
  const toggleTrackMute = useDAWStore(state => state.toggleTrackMute);
  const block = React.useMemo(
    () => blocks.find(item => item.id === blockId) ?? null,
    [blockId, blocks],
  );
  const track = React.useMemo(
    () => tracks.find(item => item.id === block?.trackId) ?? null,
    [block?.trackId, tracks],
  );

  React.useEffect(() => {
    const element = previewRef.current;
    if (!element) {
      return undefined;
    }
    const measure = () => setPreviewWidth(Math.max(240, Math.round(element.clientWidth || 720)));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!block || block.type !== 'audio' || isDrumPatternBlock(block)) {
    return null;
  }

  const isMuted = Boolean(track?.isMuted);
  const sourceOffset = block.sourceOffsetBeats ?? 0;
  const sourceLength = block.sourceLengthBeats ?? block.lengthBeats;
  const maxSourceOffset = maxAudioSourceOffset(block);
  const canSlideBackward = block.startBeat > 0;
  const canSlipBackward = sourceOffset > 0;
  const canSlipForward = sourceOffset < maxSourceOffset;
  const canRestoreTrimStart = sourceOffset > 0 && block.startBeat > 0;
  const canTrimStart = block.lengthBeats > 1;
  const canTrimEnd = block.lengthBeats > 1;
  const canExtendTrimEnd = sourceOffset + block.lengthBeats < sourceLength;
  const clipGainDb = block.clipGainDb ?? 0;
  const canReduceGain = clipGainDb > MIN_AUDIO_CLIP_GAIN_DB;
  const canBoostGain = clipGainDb < MAX_AUDIO_CLIP_GAIN_DB;
  const canNormalize = canNormalizeAudioClip(block);
  const fadeInBeats = block.fadeInBeats ?? 0;
  const fadeOutBeats = block.fadeOutBeats ?? 0;
  const isReversed = Boolean(block.isReversed);
  const canReduceFadeIn = fadeInBeats > 0;
  const canIncreaseFadeIn =
    fadeInBeats < clampAudioFadeBeats(block, 'in', fadeInBeats + AUDIO_FADE_STEP_BEATS);
  const canReduceFadeOut = fadeOutBeats > 0;
  const canIncreaseFadeOut =
    fadeOutBeats < clampAudioFadeBeats(block, 'out', fadeOutBeats + AUDIO_FADE_STEP_BEATS);
  const canCrossfade = canCrossfadeAudioClips(blocks, selectedBlockIds);

  const handleRenderInPlace = async () => {
    setIsRendering(true);
    setRenderStatus('Rendering audio');
    setRenderStatusKind(null);
    try {
      const result = await renderSelectedAudioClipsInPlace(getMediaImportBridge());
      setRenderStatusKind(result.ok ? 'ok' : 'error');
      setRenderStatus(result.ok ? 'Rendered in place' : result.error);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Render in place failed.';
      setRenderStatusKind('error');
      setRenderStatus(message);
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <section className="editor-panel audio-clip-editor-panel" aria-label="Audio clip editor">
      <div className="audio-editor-shell">
        <div className="audio-editor-preview" ref={previewRef}>
          <ClipContent
            block={block}
            widthPx={previewWidth}
            heightPx={86}
            preview={{lengthBeats: block.lengthBeats}}
            isTrackMuted={isMuted}
          />
        </div>

        <div className="audio-editor-details">
          <div className="audio-editor-title">
            <h2>{block.name}</h2>
            <p>{trackName} · {isReversed ? 'Reversed source playback' : 'Forward source playback'}</p>
          </div>
          <div className="audio-editor-stats" aria-label="Audio clip stats">
            <span>Length {beatLabel(block.lengthBeats)}</span>
            <span>Source {beatLabel(block.sourceOffsetBeats)} / {beatLabel(block.sourceLengthBeats ?? block.lengthBeats)}</span>
            <span>Gain {dbLabel(clipGainDb)}</span>
            <span>{peakLabel(block.sourcePeakAmplitude)}</span>
            <span>Fades {beatLabel(fadeInBeats)} in / {beatLabel(fadeOutBeats)} out</span>
          </div>
          <div className="audio-editor-control-grid">
            <div className="editor-action-group" aria-label="Gain controls">
              <span>Gain</span>
              <button type="button" disabled={!canReduceGain} onClick={() => nudgeAudioClipGainDb(block.id, -AUDIO_CLIP_GAIN_STEP_DB)}>
                Gain -
              </button>
              <button type="button" disabled={!canBoostGain} onClick={() => nudgeAudioClipGainDb(block.id, AUDIO_CLIP_GAIN_STEP_DB)}>
                Gain +
              </button>
              <button type="button" disabled={!canNormalize} onClick={() => normalizeAudioClipGain(block.id)}>
                Normalize
              </button>
            </div>
            <div className="editor-action-group" aria-label="Fade controls">
              <span>Fades</span>
              <button type="button" disabled={!canReduceFadeIn} onClick={() => nudgeAudioClipFade(block.id, 'in', -AUDIO_FADE_STEP_BEATS)}>
                Fade In -
              </button>
              <button type="button" disabled={!canIncreaseFadeIn} onClick={() => nudgeAudioClipFade(block.id, 'in', AUDIO_FADE_STEP_BEATS)}>
                Fade In +
              </button>
              <button type="button" disabled={!canReduceFadeOut} onClick={() => nudgeAudioClipFade(block.id, 'out', -AUDIO_FADE_STEP_BEATS)}>
                Fade Out -
              </button>
              <button type="button" disabled={!canIncreaseFadeOut} onClick={() => nudgeAudioClipFade(block.id, 'out', AUDIO_FADE_STEP_BEATS)}>
                Fade Out +
              </button>
              <button type="button" disabled={!canCrossfade} onClick={() => crossfadeSelectedAudioClips(AUDIO_CROSSFADE_BEATS)}>
                Crossfade
              </button>
            </div>
            <div className="editor-action-group" aria-label="Timing controls">
              <span>Timing</span>
              <button type="button" disabled={!canSlideBackward} onClick={() => nudgeAudioClipSlide(block.id, -AUDIO_SLIDE_STEP_BEATS)}>
                Slide -
              </button>
              <button type="button" onClick={() => nudgeAudioClipSlide(block.id, AUDIO_SLIDE_STEP_BEATS)}>
                Slide +
              </button>
              <button type="button" disabled={!canSlipBackward} onClick={() => nudgeAudioClipSourceOffset(block.id, -AUDIO_SLIP_STEP_BEATS)}>
                Slip -
              </button>
              <button type="button" disabled={!canSlipForward} onClick={() => nudgeAudioClipSourceOffset(block.id, AUDIO_SLIP_STEP_BEATS)}>
                Slip +
              </button>
              <button type="button" disabled={!canRestoreTrimStart} onClick={() => nudgeAudioClipTrimStart(block.id, -AUDIO_TRIM_STEP_BEATS)}>
                Trim Start -
              </button>
              <button type="button" disabled={!canTrimStart} onClick={() => nudgeAudioClipTrimStart(block.id, AUDIO_TRIM_STEP_BEATS)}>
                Trim Start +
              </button>
              <button type="button" disabled={!canTrimEnd} onClick={() => nudgeAudioClipTrimEnd(block.id, -AUDIO_TRIM_STEP_BEATS)}>
                Trim End -
              </button>
              <button type="button" disabled={!canExtendTrimEnd} onClick={() => nudgeAudioClipTrimEnd(block.id, AUDIO_TRIM_STEP_BEATS)}>
                Trim End +
              </button>
            </div>
            <div className="editor-action-group important" aria-label="Render and track controls">
              <span>Render · Track</span>
              <button type="button" disabled={isRendering} onClick={handleRenderInPlace}>
                Render In Place
              </button>
              <button type="button" className={isReversed ? 'active' : ''} aria-pressed={isReversed} onClick={() => toggleAudioClipReverse(block.id)}>
                Reverse
              </button>
              <button type="button" className={isMuted ? 'active' : ''} aria-pressed={isMuted} onClick={() => track && toggleTrackMute(track.id)}>
                Mute
              </button>
            </div>
          </div>
          {renderStatus ? <p className={`editor-status ${renderStatusKind ?? ''}`}>{renderStatus}</p> : null}
        </div>
      </div>
    </section>
  );
}
