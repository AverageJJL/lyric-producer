import React, {useEffect, useMemo, useRef, useState} from 'react';

import type {SongIdeaAnalysis, SongIdeaSectionAnalysis} from '../../onboarding/songIdeaAnalysis';
import type {SongAnalysisPhase} from './SongAnalysisPanel';
import {lyricHighlightTiming, splitLyricWords} from './songLyricHighlightTiming';

type SongLyricWheelProps = {
  analysis: SongIdeaAnalysis | null;
  activeSection: number;
  analysisPhase: SongAnalysisPhase;
  lyricsText: string;
  lyricsState: 'idle' | 'loading' | 'ready' | 'error';
  selectedTitle: string;
  copyright: string | null;
  onActiveSectionChange: (index: number) => void;
};

type RenderedSection = {
  section: SongIdeaSectionAnalysis;
  analysisIndex: number;
};

function phaseLabel(phase: SongAnalysisPhase, lyricsState: SongLyricWheelProps['lyricsState']): string {
  if (phase === 'checking-metadata' || phase === 'web-metadata' || phase === 'analysing-sections') {
    return 'Analysing';
  }
  return lyricsState === 'ready' ? 'Lyrics' : 'Waiting';
}

function centeredScrollTop(container: HTMLElement, target: HTMLElement): number {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (targetRect.height > 0 || targetRect.top !== 0 || containerRect.top !== 0) {
    return Math.max(0, container.scrollTop + targetRect.top - containerRect.top + targetRect.height / 2 - container.clientHeight / 2);
  }
  let offset = 0;
  let node: HTMLElement | null = target;
  while (node && node !== container) {
    offset += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return Math.max(0, offset + target.offsetHeight / 2 - container.clientHeight / 2);
}

export function SongLyricWheel({
  analysis,
  activeSection,
  analysisPhase,
  lyricsState,
  selectedTitle,
  copyright,
  onActiveSectionChange,
}: SongLyricWheelProps) {
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const lineRefs = useRef(new Map<string, HTMLParagraphElement>());
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const renderedSections = useMemo<RenderedSection[]>(() => {
    if (analysis) {
      return analysis.sections
        .map((section, analysisIndex) => ({section, analysisIndex}))
        .filter(item => item.section.lyrics.length > 0);
    }
    return [];
  }, [analysis]);
  const maxAnalysisIndex = analysis?.sections.length ? analysis.sections.length - 1 : renderedSections.length - 1;
  const activeIndex = Math.min(activeSection, maxAnalysisIndex);
  const activeRenderedIndex = useMemo(() => {
    const exact = renderedSections.findIndex(item => item.analysisIndex === activeIndex);
    if (exact >= 0) {
      return exact;
    }
    let previous = -1;
    let next = -1;
    renderedSections.forEach((item, index) => {
      if (item.analysisIndex < activeIndex) {
        previous = index;
      } else if (next < 0 && item.analysisIndex > activeIndex) {
        next = index;
      }
    });
    return next >= 0 ? next : previous;
  }, [activeIndex, renderedSections]);
  const activeRenderedSection = activeRenderedIndex >= 0 ? renderedSections[activeRenderedIndex] : undefined;
  const activeLyrics = activeRenderedSection?.section.lyrics ?? [];
  const activeLyricsKey = `${activeRenderedSection?.analysisIndex ?? -1}:${activeLyrics.join('\n')}`;

  useEffect(() => {
    setActiveLineIndex(0);
    setActiveWordIndex(0);
  }, [activeRenderedIndex, activeLyricsKey]);

  useEffect(() => {
    if (activeLyrics.length === 0) return undefined;
    const timing = lyricHighlightTiming(activeLyrics);
    const words = splitLyricWords(activeLyrics[activeLineIndex] ?? '');
    const lastWordIndex = Math.max(0, words.length - 1);
    if (activeWordIndex < lastWordIndex) {
      const timer = window.setTimeout(() => setActiveWordIndex(index => index + 1), timing.wordMs);
      return () => window.clearTimeout(timer);
    }
    if (activeLineIndex >= activeLyrics.length - 1) return undefined;
    const timer = window.setTimeout(() => {
      setActiveLineIndex(index => Math.min(activeLyrics.length - 1, index + 1));
      setActiveWordIndex(0);
    }, timing.linePauseMs);
    return () => window.clearTimeout(timer);
  }, [activeLineIndex, activeWordIndex, activeLyrics, activeLyricsKey]);

  useEffect(() => {
    const wheel = wheelRef.current;
    const section = activeRenderedIndex >= 0 ? sectionRefs.current[activeRenderedIndex] : null;
    const lineKey = `${activeRenderedSection?.section.id ?? 'none'}:${activeLineIndex}`;
    const line = lineRefs.current.get(lineKey);
    const target = line ?? section;
    if (!wheel || !target) return;
    const top = centeredScrollTop(wheel, target);
    if (typeof wheel.scrollTo === 'function') {
      wheel.scrollTo({top, behavior: analysisPhase === 'idle' ? 'auto' : 'smooth'});
    } else {
      wheel.scrollTop = top;
    }
  }, [activeLineIndex, activeRenderedIndex, activeRenderedSection, analysisPhase, renderedSections.length]);

  return (
    <div className="lyrics-analyser-panel" aria-label="Lyric analysis preview">
      <div className="lyrics-panel-header">
        <span>{phaseLabel(analysisPhase, lyricsState)}</span>
        <strong>{analysis?.title ?? selectedTitle}</strong>
      </div>
      <div className="lyrics-wheel-frame">
        <div className="lyrics-wheel" ref={wheelRef}>
          {renderedSections.length > 0 ? (
            <div className="lyrics-spotlight-stack">
              {renderedSections.map(({section, analysisIndex}, index) => (
                <article
                  key={section.id}
                  ref={node => { sectionRefs.current[index] = node; }}
                  aria-label={section.name}
                  className={`lyrics-spotlight-section ${index === activeRenderedIndex ? 'active' : ''}`}
                  onClick={() => {
                    setActiveLineIndex(0);
                    setActiveWordIndex(0);
                    onActiveSectionChange(analysisIndex);
                  }}>
                  {section.lyrics.map((line, lineIndex) => {
                    const isCurrentLine = index === activeRenderedIndex && lineIndex === activeLineIndex;
                    const words = splitLyricWords(line);
                    return (
                      <p
                        key={`${section.id}-${lineIndex}`}
                        aria-label={line}
                        ref={node => {
                          const key = `${section.id}:${lineIndex}`;
                          if (node) lineRefs.current.set(key, node);
                          else lineRefs.current.delete(key);
                        }}
                        className={`lyrics-line ${isCurrentLine ? 'is-current' : ''}`}>
                        {words.map((word, wordIndex) => (
                          <React.Fragment key={`${section.id}-${lineIndex}-${wordIndex}`}>
                            <span className={`lyrics-word ${isCurrentLine && wordIndex <= activeWordIndex ? 'is-lit' : ''}`}>
                              {word}
                            </span>
                            {wordIndex < words.length - 1 ? ' ' : null}
                          </React.Fragment>
                        ))}
                      </p>
                    );
                  })}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-lyrics">{lyricsState === 'ready' ? 'Structuring lyrics.' : 'Search and select a song to show lyrics here.'}</p>
          )}
        </div>
        <span className="lyrics-wheel-edge top" aria-hidden="true" />
        <span className="lyrics-wheel-edge bottom" aria-hidden="true" />
      </div>
      {copyright ? <p className="lyrics-copyright">{copyright}</p> : null}
    </div>
  );
}
