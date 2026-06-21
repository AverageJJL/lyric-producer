import React from 'react';

import {
  formatEvidenceLabel,
  type InstrumentGraphModel,
  type InstrumentPoint,
  type LyricEvidenceModel,
} from './timelineLyricEvidence';

type PopupStyle = React.CSSProperties & {
  '--lyrics-popover-arrow-left': string;
};

type TimelineLyricEvidencePopupProps = {
  id: string;
  model: LyricEvidenceModel;
  left: number;
  width: number;
  arrowLeft: number;
  isCursor: boolean;
  isPinned: boolean;
  onPin: () => void;
  onClose: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

const GRAPH_COLORS = ['#ee5c6b', '#eadb79', '#c7aeb8', '#a28b62'];
const GRAPH_HEIGHT = 124;
const PLOT_LEFT = 18;
const PLOT_TOP = 12;
const PLOT_RIGHT_GUTTER = 6;
const PLOT_HEIGHT = 80;
const RHYME_HELP = 'A marks a repeated rhyme family. - means no local match. Slant and context matches are approximate.';

type PlotBounds = {x: number; y: number; width: number; height: number};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function plotFor(popupWidth: number): PlotBounds {
  const graphWidth = Math.max(220, Math.round(popupWidth - 20));
  return {
    x: PLOT_LEFT,
    y: PLOT_TOP,
    width: graphWidth - PLOT_LEFT - PLOT_RIGHT_GUTTER,
    height: PLOT_HEIGHT,
  };
}

function plotPoint(point: InstrumentPoint, duration: number, plot: PlotBounds) {
  return {
    x: plot.x + clamp(point.timestamp / duration, 0, 1) * plot.width,
    y: plot.y + (1 - clamp(point.value, 0, 1)) * plot.height,
  };
}

function smoothPathFor(points: InstrumentPoint[], duration: number, plot: PlotBounds): string {
  const plotted = points.map(point => plotPoint(point, duration, plot));
  if (plotted.length === 0) return '';
  if (plotted.length === 1) return `M${plotted[0].x.toFixed(1)} ${plotted[0].y.toFixed(1)}`;
  return plotted.slice(1).reduce((path, point, index) => {
    const previous = plotted[index];
    const beforePrevious = plotted[Math.max(0, index - 1)];
    const afterPoint = plotted[Math.min(plotted.length - 1, index + 2)];
    const c1x = clamp(previous.x + (point.x - beforePrevious.x) / 6, plot.x, plot.x + plot.width);
    const c1y = clamp(previous.y + (point.y - beforePrevious.y) / 6, plot.y, plot.y + plot.height);
    const c2x = clamp(point.x - (afterPoint.x - previous.x) / 6, plot.x, plot.x + plot.width);
    const c2y = clamp(point.y - (afterPoint.y - previous.y) / 6, plot.y, plot.y + plot.height);
    return `${path} C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, `M${plotted[0].x.toFixed(1)} ${plotted[0].y.toFixed(1)}`);
}

function InstrumentGraph({model, popupWidth}: {model: InstrumentGraphModel; popupWidth: number}) {
  const graphWidth = Math.max(220, Math.round(popupWidth - 20));
  const plot = plotFor(popupWidth);
  const highlightX = plot.x + model.highlightStart / model.duration * plot.width;
  const highlightWidth = Math.max(3, (model.highlightEnd - model.highlightStart) / model.duration * plot.width);
  return (
    <span className="lyrics-instrument-graph" aria-label="Cyanite instrument graph">
      <span className="lyrics-instrument-head">
        <span>Instruments</span>
        <small>{model.barLabel} - {model.timeLabel}</small>
      </span>
      <span className="lyrics-graph-legend-row">
        {model.series.map((item, index) => (
          <span key={item.label} className="lyrics-graph-legend-chip">
            <i style={{backgroundColor: GRAPH_COLORS[index]}} />
            {formatEvidenceLabel(item.label)}
          </span>
        ))}
      </span>
      <svg viewBox={`0 0 ${graphWidth} ${GRAPH_HEIGHT}`} role="img" aria-label={`Instrument presence graph for ${model.sectionName}`}>
        <line className="lyrics-graph-axis" x1={plot.x} x2={plot.x} y1={plot.y} y2={plot.y + plot.height} />
        <line className="lyrics-graph-axis" x1={plot.x} x2={plot.x + plot.width} y1={plot.y + plot.height} y2={plot.y + plot.height} />
        <rect className="lyrics-graph-highlight" data-testid="instrument-section-highlight" x={highlightX} y={plot.y} width={highlightWidth} height={plot.height} />
        {[0, 0.5, 1].map(value => (
          <text key={value} className="lyrics-graph-tick" x={2} y={plot.y + (1 - value) * plot.height + 4}>{value}</text>
        ))}
        {model.series.map((item, index) => (
          <path key={item.label} d={smoothPathFor(item.points, model.duration, plot)} stroke={GRAPH_COLORS[index]} className="lyrics-graph-line" />
        ))}
      </svg>
    </span>
  );
}

function ProducerCues({model}: {model: LyricEvidenceModel}) {
  return (
    <span className="lyrics-producer-readout">
      <span className="lyrics-mood-label">Producer cues</span>
      {model.producer.flags.length > 0 ? (
        <span className="lyrics-flow-flags">
          {model.producer.flags.map(flag => <b key={flag}>{flag}</b>)}
        </span>
      ) : null}
      <span className="lyrics-cue-list">
        {model.producer.cues.map(cue => <small key={cue}>{cue}</small>)}
      </span>
    </span>
  );
}

function ChordReadout({model}: {model: LyricEvidenceModel}) {
  return (
    <span className={`lyrics-chord-readout ${model.chord.kind}`}>
      <span>{model.chord.label}</span>
      <strong>{model.chord.detail}</strong>
    </span>
  );
}

function rhymeTitle(line: LyricEvidenceModel['producer']['lines'][number]): string {
  if (line.rhymeKind === 'context') {
    return line.contextSectionName
      ? `Context rhyme with ${line.contextSectionName}`
      : 'Context rhyme with a neighboring section';
  }
  if (line.rhymeKind === 'slant') return 'Slant rhyme';
  if (line.rhymeKind === 'exact') return 'Exact rhyme family';
  return 'No local rhyme match';
}

function LyricReadout({model}: {model: LyricEvidenceModel}) {
  const producer = model.producer;
  const lineLabel = `${producer.lineCount} ${producer.lineCount === 1 ? 'line' : 'lines'}`;
  const syllableLabel = `${producer.totalSyllables} ${producer.totalSyllables === 1 ? 'syllable' : 'syllables'}`;
  return (
    <span className="lyrics-section-readout">
      <span className="lyrics-readout-meta">
        <b>{lineLabel}</b>
        <b>{syllableLabel}</b>
        <b>{producer.averageSyllables} avg/line</b>
      </span>
      <span className="lyrics-rhyme-readout">
        <small title={RHYME_HELP}>Rhyme</small>
        <strong title={RHYME_HELP}>{producer.rhymeScheme || 'none'}</strong>
      </span>
      <span className="lyrics-popup-lines">
        {producer.lines.length > 0 ? producer.lines.map((line, index) => (
          <span key={line.id ?? `${line.text}-${index}`}>
            <small className={`rhyme-${line.rhymeKind}`} title={rhymeTitle(line)}>{line.rhymeLabel}</small>
            <b>{line.text}</b>
            <i>{line.syllables}</i>
          </span>
        )) : <em>No lyric lines in this section yet.</em>}
      </span>
    </span>
  );
}

export const TimelineLyricEvidencePopup = React.forwardRef<HTMLSpanElement, TimelineLyricEvidencePopupProps>(
  function TimelineLyricEvidencePopup({
    id,
    model,
    left,
    width,
    arrowLeft,
    isCursor,
    isPinned,
    onPin,
    onClose,
    onPointerEnter,
    onPointerLeave,
  }, ref) {
    const style: PopupStyle = {
      left,
      width,
      '--lyrics-popover-arrow-left': `${arrowLeft}px`,
    };
    return (
      <span
        id={id}
        ref={ref}
        role="tooltip"
        className={`lyrics-analysis-popover is-visible${isCursor ? ' is-cursor' : ''}`}
        style={style}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}>
        <span className="lyrics-evidence-head">
          <span>
            <strong>{model.sectionName}</strong>
            <small>{model.sourceLabel} - {model.barLabel} - {model.timeLabel}</small>
          </span>
          <span className="lyrics-popup-actions">
            <button type="button" aria-label={isPinned ? 'Unpin lyric popup' : 'Pin lyric popup'} onClick={onPin}>
              {isPinned ? 'Pinned' : 'Pin'}
            </button>
            <button type="button" aria-label="Close lyric popup" onClick={onClose}>Close</button>
          </span>
        </span>
        <span className="lyrics-popup-grid">
          <span className="lyrics-popup-left">
            {model.moods.length > 0 ? (
              <span className="lyrics-mood-group">
                <span className="lyrics-mood-label">Mood tags</span>
                <span className="lyrics-mood-strip" aria-label="Section mood evidence">
                  {model.moods.map(mood => (
                    <span key={`${mood.label}-${mood.timeLabel}`} className="lyrics-mood-chip">
                      <b>{mood.label}</b>
                      <small>{mood.timeLabel}</small>
                    </span>
                  ))}
                </span>
              </span>
            ) : null}
            <ProducerCues model={model} />
            <ChordReadout model={model} />
            {model.graph ? <InstrumentGraph model={model.graph} popupWidth={width} /> : null}
          </span>
          <LyricReadout model={model} />
        </span>
      </span>
    );
  },
);
