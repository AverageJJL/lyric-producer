import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';

import type {SongIdeaAnalysis} from '../src/onboarding/songIdeaAnalysis';
import {SongLyricWheel} from '../src/web/components/SongLyricWheel';
import {BASE_WORD_HIGHLIGHT_MS, LINE_PAUSE_MS} from '../src/web/components/songLyricHighlightTiming';

function analysis(): SongIdeaAnalysis {
  return {
    title: 'Halo - Beyonce',
    bpm: 80,
    scale: {root: 'A', mode: 'major'},
    keySource: 'test',
    bpmKey: {source: 'test', confidence: 1},
    sections: [{
      id: 'verse',
      name: 'Verse',
      bars: 4,
      lyricRange: {startLine: 0, endLine: 1},
      lyrics: ['Remember those walls', 'I found a way'],
      lyricPreview: ['Remember those walls', 'I found a way'],
      mood: 'wide-eyed',
      meaning: 'A memory opens.',
      productionDrivers: [],
      productionCue: 'piano',
      confidence: 0.8,
    }],
  };
}

function renderWheel(onActiveSectionChange = jest.fn(), nextAnalysis = analysis(), activeSection = 0) {
  return render(
    <SongLyricWheel
      analysis={nextAnalysis}
      activeSection={activeSection}
      analysisPhase="analysing-sections"
      lyricsText=""
      lyricsState="ready"
      selectedTitle="Halo"
      copyright={null}
      onActiveSectionChange={onActiveSectionChange}
    />,
  );
}

describe('SongLyricWheel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps lyric edges scrollable with enough focus gutter for first and final sections', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'web', 'styles', 'song-analyser.css'), 'utf8');

    expect(css).toContain('overflow-y: auto;');
    expect(css).toContain('scrollbar-width: none;');
    expect(css).toContain('--lyrics-focus-gutter: clamp(260px, 47dvh, 430px);');
    expect(css).toContain('--lyrics-focus-gutter: clamp(180px, 28vh, 260px);');
    expect(css).toMatch(/\.lyrics-wheel-edge \{[\s\S]*height: 30%;/);
    expect(css).toMatch(/\.lyrics-wheel-edge\.bottom \{[\s\S]*height: 34%;/);
  });

  it('removes reference DNA mini charts and highlights active lyrics word by word', () => {
    const {container} = renderWheel();

    expect(container.querySelector('.lyrics-reference-dna')).not.toBeInTheDocument();
    expect(container.querySelector('.lyrics-reference-bars')).not.toBeInTheDocument();
    expect(container.querySelector('.lyrics-reference-tags')).not.toBeInTheDocument();

    let lines = container.querySelectorAll('.lyrics-line');
    let firstLineWords = lines[0].querySelectorAll('.lyrics-word');
    expect(lines[0]).toHaveClass('is-current');
    expect(firstLineWords[0]).toHaveClass('is-lit');
    expect(firstLineWords[1]).not.toHaveClass('is-lit');

    act(() => { jest.advanceTimersByTime(BASE_WORD_HIGHLIGHT_MS); });
    expect(firstLineWords[0]).toHaveClass('is-lit');
    expect(firstLineWords[1]).toHaveClass('is-lit');

    act(() => { jest.advanceTimersByTime(BASE_WORD_HIGHLIGHT_MS); });
    expect(firstLineWords[2]).toHaveClass('is-lit');
    act(() => { jest.advanceTimersByTime(LINE_PAUSE_MS); });
    lines = container.querySelectorAll('.lyrics-line');
    firstLineWords = lines[0].querySelectorAll('.lyrics-word');
    const secondLineWords = lines[1].querySelectorAll('.lyrics-word');
    expect(lines[0]).not.toHaveClass('is-current');
    expect(firstLineWords[0]).not.toHaveClass('is-lit');
    expect(lines[1]).toHaveClass('is-current');
    expect(secondLineWords[0]).toHaveClass('is-lit');
  });

  it('resets the word highlight when the current section is clicked', () => {
    const onActiveSectionChange = jest.fn();
    const {container} = renderWheel(onActiveSectionChange);

    act(() => { jest.advanceTimersByTime(BASE_WORD_HIGHLIGHT_MS); });
    let words = container.querySelectorAll('.lyrics-line')[0].querySelectorAll('.lyrics-word');
    expect(words[1]).toHaveClass('is-lit');

    fireEvent.click(screen.getByLabelText('Verse'));
    words = container.querySelectorAll('.lyrics-line')[0].querySelectorAll('.lyrics-word');
    expect(onActiveSectionChange).toHaveBeenCalledWith(0);
    expect(words[0]).toHaveClass('is-lit');
    expect(words[1]).not.toHaveClass('is-lit');
  });

  it('does not render raw unstructured lyrics before the section model is ready', () => {
    render(
      <SongLyricWheel
        analysis={null}
        activeSection={0}
        analysisPhase="checking-metadata"
        lyricsText={'Oh, woah\nOh, woah\nYou know you love me'}
        lyricsState="ready"
        selectedTitle="Baby"
        copyright={null}
        onActiveSectionChange={jest.fn()}
      />,
    );

    expect(screen.getByText('Structuring lyrics.')).toBeInTheDocument();
    expect(screen.queryByLabelText('You know you love me')).not.toBeInTheDocument();
  });

  it('prefers the next visible lyric section when the active analysis section has no lyrics', () => {
    const nextAnalysis = analysis();
    nextAnalysis.sections = [
      {...nextAnalysis.sections[0], id: 'intro', name: 'Intro', lyrics: ['Go now'], lyricPreview: ['Go now']},
      {...nextAnalysis.sections[0], id: 'empty', name: 'Build', lyrics: [], lyricPreview: []},
      {...nextAnalysis.sections[0], id: 'verse', name: 'Verse', lyrics: ['Next line'], lyricPreview: ['Next line']},
    ];
    const {container} = renderWheel(jest.fn(), nextAnalysis, 1);

    const activeSection = container.querySelector('.lyrics-spotlight-section.active');
    expect(activeSection).toHaveAccessibleName('Verse');
    expect(screen.getByLabelText('Next line')).toHaveClass('is-current');
  });

  it('centers the new active section line when the parent active section changes', () => {
    const nextAnalysis = analysis();
    nextAnalysis.sections = [
      {...nextAnalysis.sections[0], id: 'intro', name: 'Intro', lyrics: ['Go now'], lyricPreview: ['Go now']},
      {...nextAnalysis.sections[0], id: 'verse', name: 'Verse', lyrics: ['Next line'], lyricPreview: ['Next line']},
    ];
    const {container, rerender} = renderWheel(jest.fn(), nextAnalysis);
    const wheel = container.querySelector('.lyrics-wheel') as HTMLDivElement;
    const nextLine = screen.getByLabelText('Next line');
    const scrollTo = jest.fn();
    Object.defineProperty(wheel, 'clientHeight', {value: 200, configurable: true});
    wheel.scrollTop = 20;
    wheel.scrollTo = scrollTo;
    wheel.getBoundingClientRect = () => ({top: 100, bottom: 300, left: 0, right: 400, width: 400, height: 200, x: 0, y: 100, toJSON: () => ({})});
    nextLine.getBoundingClientRect = () => ({top: 430, bottom: 470, left: 0, right: 300, width: 300, height: 40, x: 0, y: 430, toJSON: () => ({})});

    rerender(
      <SongLyricWheel
        analysis={nextAnalysis}
        activeSection={1}
        analysisPhase="analysing-sections"
        lyricsText=""
        lyricsState="ready"
        selectedTitle="Halo"
        copyright={null}
        onActiveSectionChange={jest.fn()}
      />,
    );

    expect(scrollTo).toHaveBeenLastCalledWith({top: 270, behavior: 'smooth'});
  });

  it('does not restart the current line when section ids refresh with the same lyrics', () => {
    const nextAnalysis = analysis();
    nextAnalysis.sections = [
      {...nextAnalysis.sections[0], id: 'intro-a', name: 'Intro', lyrics: ['Go now'], lyricPreview: ['Go now']},
    ];
    const {container, rerender} = renderWheel(jest.fn(), nextAnalysis);
    act(() => { jest.advanceTimersByTime(BASE_WORD_HIGHLIGHT_MS); });
    expect(container.querySelectorAll('.lyrics-word')[1]).toHaveClass('is-lit');

    rerender(
      <SongLyricWheel
        analysis={{...nextAnalysis, sections: [{...nextAnalysis.sections[0], id: 'intro-b'}]}}
        activeSection={0}
        analysisPhase="analysing-sections"
        lyricsText=""
        lyricsState="ready"
        selectedTitle="Halo"
        copyright={null}
        onActiveSectionChange={jest.fn()}
      />,
    );

    expect(container.querySelectorAll('.lyrics-word')[1]).toHaveClass('is-lit');
  });
});
