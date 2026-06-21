import React, {useMemo} from 'react';

import type {SectionMarker} from '../../store/projectMetadata';
import {sectionBandTone} from './timelineSectionBandColors';

type TimelineSectionBandsProps = {
  sections: SectionMarker[];
  arrangementHeight: number;
  strongHeight: number;
  visibleTimelineBeats: number;
  pixelsPerBeat: number;
  rulerHeight: number;
};

type SectionBandLayout = {
  id: string;
  name: string;
  left: number;
  width: number;
  toneKey: string;
  background: string;
  border: string;
};

function sectionColumnLayouts(
  sections: SectionMarker[],
  visibleTimelineBeats: number,
  pixelsPerBeat: number,
): SectionBandLayout[] {
  let previousToneKey: string | undefined;
  return sections
    .map((section, index) => ({section, index}))
    .sort((left, right) => left.section.startBeat - right.section.startBeat || left.index - right.index)
    .map(({section, index}) => {
      const tone = sectionBandTone(section, index, previousToneKey);
      previousToneKey = tone.key;
      return sectionColumnLayout(section, visibleTimelineBeats, pixelsPerBeat, tone);
    }).filter((layout): layout is SectionBandLayout => layout !== null);
}

function sectionColumnLayout(
  section: SectionMarker,
  visibleTimelineBeats: number,
  pixelsPerBeat: number,
  tone: ReturnType<typeof sectionBandTone>,
): SectionBandLayout | null {
  const startBeat = Math.max(0, section.startBeat);
  const endBeat = Math.min(visibleTimelineBeats, startBeat + Math.max(1, section.lengthBeats));
  if (endBeat <= startBeat) {
    return null;
  }
  return {
    id: section.id,
    name: section.name,
    left: startBeat * pixelsPerBeat,
    width: Math.max(1, (endBeat - startBeat) * pixelsPerBeat),
    toneKey: tone.key,
    background: tone.background,
    border: tone.border,
  };
}

export function TimelineSectionBands({
  sections,
  arrangementHeight,
  strongHeight,
  visibleTimelineBeats,
  pixelsPerBeat,
  rulerHeight,
}: TimelineSectionBandsProps) {
  const bands = useMemo(
    () => sectionColumnLayouts(sections, visibleTimelineBeats, pixelsPerBeat),
    [pixelsPerBeat, sections, visibleTimelineBeats],
  );

  if (bands.length === 0 || arrangementHeight <= 0) {
    return null;
  }

  const solidHeight = Math.max(0, Math.min(strongHeight, arrangementHeight));

  return (
    <div
      className="timeline-section-bands"
      aria-hidden="true"
      style={{top: rulerHeight, height: arrangementHeight}}>
      {bands.map(band => (
        <span
          key={band.id}
          className="timeline-section-band"
          data-section-name={band.name}
          data-section-tone={band.toneKey}
          style={{
            left: band.left,
            width: band.width,
            borderColor: band.border,
            '--section-band-background': band.background,
            '--section-band-solid-height': `${solidHeight}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
