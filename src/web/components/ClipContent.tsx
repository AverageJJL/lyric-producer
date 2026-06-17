import React, {useMemo} from 'react';

import {isDrumPatternBlock} from '../../music/clipFactories';
import {drumPatternDotsLayout} from '../../music/drumPatternPreviewLayout';
import {notesToPreviewLayout} from '../../music/midiClipPreviewLayout';
import type {DAWBlock} from '../../store/useDAWStore';
import {useDAWStore} from '../../store/useDAWStore';
import {waveformPreviewLayout} from '../../music/waveformPreviewLayout';
import {clipDisplayPixelsPerBeat} from '../../ui/clipDisplayScale';

export type ClipPreviewState = {
  lengthBeats: number;
  startBeat?: number;
  sourceOffsetBeats?: number;
  /** Drum loop extension preview — dim hits from this beat while dragging. */
  drumDimFromBeat?: number;
};

type ClipContentProps = {
  block: DAWBlock;
  widthPx: number;
  heightPx: number;
  pixelsPerBeat?: number;
  preview?: ClipPreviewState;
  isTrackMuted?: boolean;
};

export function ClipContent({block, widthPx, heightPx, pixelsPerBeat, preview, isTrackMuted}: ClipContentProps) {
  const lengthBeats = preview?.lengthBeats ?? block.lengthBeats;
  if (block.type === 'midi') {
    return (
      <MidiPreview
        block={block}
        lengthBeats={lengthBeats}
        widthPx={widthPx}
        heightPx={heightPx}
        pixelsPerBeat={pixelsPerBeat}
      />
    );
  }
  if (isDrumPatternBlock(block) && block.patternId) {
    return (
      <DrumPatternPreview
        block={block}
        widthPx={widthPx}
        heightPx={heightPx}
        lengthBeats={lengthBeats}
        drumDimFromBeat={preview?.drumDimFromBeat}
      />
    );
  }
  return (
    <WaveformPreview
      block={block}
      widthPx={widthPx}
      heightPx={heightPx}
      lengthBeats={lengthBeats}
      sourceLengthBeats={block.sourceLengthBeats ?? block.lengthBeats}
      sourceOffsetBeats={preview?.sourceOffsetBeats ?? block.sourceOffsetBeats ?? 0}
      isTrackMuted={isTrackMuted}
    />
  );
}

function MidiPreview({
  block,
  lengthBeats,
  widthPx,
  heightPx,
  pixelsPerBeat,
}: {
  block: DAWBlock;
  lengthBeats: number;
  widthPx: number;
  heightPx: number;
  pixelsPerBeat?: number;
}) {
  const layout = useMemo(
    () => notesToPreviewLayout(block.notes ?? [], lengthBeats, widthPx, heightPx, pixelsPerBeat),
    [block.notes, heightPx, lengthBeats, pixelsPerBeat, widthPx],
  );

  return (
    <div className="clip-preview midi-clip-preview">
      {layout.gridLines.map(line => (
        <span
          key={line.key}
          className={`midi-grid-line ${line.isBar ? 'bar' : 'beat'}`}
          style={{left: line.left}}
        />
      ))}
      {layout.isEmpty ? <span className="midi-preview-empty">No notes</span> : null}
      {layout.notes.map(note => (
        <span
          key={note.key}
          className="midi-note-preview"
          style={{
            top: note.top,
            left: note.left,
            width: note.width,
            height: note.height,
            opacity: note.opacity,
          }}
        />
      ))}
    </div>
  );
}

function DrumPatternPreview({
  block,
  widthPx,
  heightPx,
  lengthBeats,
  drumDimFromBeat,
}: {
  block: DAWBlock;
  widthPx: number;
  heightPx: number;
  lengthBeats: number;
  drumDimFromBeat?: number;
}) {
  const pattern = useDAWStore(state => (block.patternId ? state.patterns[block.patternId] : undefined));
  const dots = useMemo(() => {
    if (!pattern) {
      return [];
    }
    return drumPatternDotsLayout(
      pattern,
      lengthBeats,
      heightPx,
      clipDisplayPixelsPerBeat(widthPx, lengthBeats),
      {dimmedFromBeat: drumDimFromBeat},
    );
  }, [drumDimFromBeat, heightPx, lengthBeats, pattern, widthPx]);

  return (
    <div className="clip-preview drum-preview">
      {dots.map(dot => dot ? (
        <span
          key={dot.key}
          className={`drum-dot ${dot.looped ? 'looped' : ''}`}
          style={{left: dot.left, top: dot.top, width: dot.width, height: dot.height}}
        />
      ) : null)}
    </div>
  );
}

function WaveformPreview({
  block,
  widthPx,
  heightPx,
  lengthBeats,
  sourceLengthBeats,
  sourceOffsetBeats,
  isTrackMuted,
}: {
  block: DAWBlock;
  widthPx: number;
  heightPx: number;
  lengthBeats: number;
  sourceLengthBeats: number;
  sourceOffsetBeats: number;
  isTrackMuted?: boolean;
}) {
  const liveAudio = useDAWStore(state => state.liveAudioPreviewByClip[block.id]);
  const isRecordingBlock = block.name === 'Recording';
  const isMuted = Boolean(block.isMuted || isTrackMuted);
  const clipGainDb = block.clipGainDb ?? 0;
  const gainClass =
    clipGainDb > 0.1 ? 'gain-boosted' : clipGainDb < -0.1 ? 'gain-reduced' : '';
  const peaks =
    block.waveformPeaks && block.waveformPeaks.length > 0
      ? block.waveformPeaks
      : (liveAudio?.peaks ?? []);
  const hasAudioFile = Boolean(block.audioFilePath) || peaks.length > 0;

  const layout = useMemo(() => {
    const usingLivePeaks =
      isRecordingBlock && liveAudio && peaks.length > 0 && !block.waveformPeaks?.length;

    return waveformPreviewLayout(
      peaks,
      hasAudioFile,
      lengthBeats,
      widthPx,
      heightPx,
      sourceLengthBeats,
      sourceOffsetBeats,
      clipDisplayPixelsPerBeat(widthPx, lengthBeats),
      undefined,
      {
        liveRecording: usingLivePeaks,
        isReversed: Boolean(block.isReversed),
        fadeInBeats: block.fadeInBeats,
        fadeOutBeats: block.fadeOutBeats,
        clipGainDb,
      },
    );
  }, [
    block.fadeInBeats,
    block.fadeOutBeats,
    block.isReversed,
    block.waveformPeaks,
    clipGainDb,
    hasAudioFile,
    heightPx,
    isRecordingBlock,
    lengthBeats,
    liveAudio,
    peaks,
    sourceLengthBeats,
    sourceOffsetBeats,
    widthPx,
  ]);

  return (
    <div
      className={`waveform-preview ${isMuted ? 'muted' : ''} ${block.isReversed ? 'reversed' : ''} ${gainClass}`}
      style={{width: widthPx}}>
      <div
        className="waveform-preview-strip"
        style={{
          width: layout.sourceWidthPx,
          height: layout.stripHeightPx,
          marginLeft: -layout.offsetPx,
        }}>
        <svg
          className="waveform-svg"
          width={layout.sourceWidthPx}
          height={layout.stripHeightPx}
          aria-hidden>
          <line
            className="waveform-centerline"
            x1={0}
            y1={layout.centerY}
            x2={layout.sourceWidthPx}
            y2={layout.centerY}
          />
          {layout.pathD ? (
            <path
              className={`waveform-fill ${layout.hasAudibleWaveform ? '' : 'silent'}`}
              d={layout.pathD}
            />
          ) : null}
          {layout.fadeOverlays.map(overlay => (
            <g key={overlay.edge} className={`waveform-fade ${overlay.edge}`}>
              <path className="waveform-fade-mask" d={overlay.maskD} />
              <path className="waveform-fade-curve" d={overlay.curveD} />
            </g>
          ))}
        </svg>
      </div>
      {isMuted ? <span className="waveform-state-badge">Muted</span> : null}
      {block.isReversed ? <span className="waveform-direction-badge">Rev</span> : null}
      {clipGainDb > 0.1 ? (
        <span className="waveform-gain-badge">+{clipGainDb.toFixed(1)} dB</span>
      ) : null}
    </div>
  );
}
