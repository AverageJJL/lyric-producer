import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';

import {TimelineLyricsLane} from '../src/web/components/TimelineLyricsLane';
import type {ReferenceMoodAnalysis} from '../src/store/referenceMoodAnalysis';
import type {SectionMarker} from '../src/store/projectMetadata';
import {defaultLyricDocument, type LyricDocument} from '../src/store/lyrics';

function reference(overrides: Partial<ReferenceMoodAnalysis> = {}): ReferenceMoodAnalysis {
  return {
    provider: 'cyanite',
    libraryTrackId: 'ref-1',
    moodTags: [],
    moodAdvancedTags: [],
    movementTags: [],
    characterTags: [],
    genreTags: [],
    subgenreTags: [],
    instrumentTags: ['bass', 'electronicDrums', 'percussion', 'synthesizer'],
    voiceTags: [],
    freeGenreTags: [],
    curves: {
      mood: [
        {label: 'sexy', points: [{timestamp: 0, value: 0.2}, {timestamp: 15, value: 0.8}, {timestamp: 30, value: 0.2}, {timestamp: 45, value: 0.1}]},
        {label: 'uplifting', points: [{timestamp: 0, value: 0.5}, {timestamp: 15, value: 0.7}, {timestamp: 30, value: 0.6}, {timestamp: 45, value: 0.4}]},
        {label: 'energetic', points: [{timestamp: 0, value: 0.4}, {timestamp: 15, value: 0.6}, {timestamp: 30, value: 0.9}, {timestamp: 45, value: 0.8}]},
        {label: 'aggressive', points: [{timestamp: 0, value: 0.1}, {timestamp: 15, value: 0.2}, {timestamp: 30, value: 0.95}, {timestamp: 45, value: 0.9}]},
      ],
      instrumentsExtended: [
        {label: 'bass', points: [{timestamp: 0, value: 0.3}, {timestamp: 15, value: 0.7}, {timestamp: 30, value: 0.76}, {timestamp: 45, value: 0.69}]},
        {label: 'electronicDrums', points: [{timestamp: 0, value: 0.86}, {timestamp: 15, value: 0.92}, {timestamp: 30, value: 0.97}, {timestamp: 45, value: 0.9}]},
        {label: 'percussion', points: [{timestamp: 0, value: 0.97}, {timestamp: 15, value: 0.98}, {timestamp: 30, value: 0.96}, {timestamp: 45, value: 0.97}]},
        {label: 'synthesizer', points: [{timestamp: 0, value: 0.7}, {timestamp: 15, value: 0.82}, {timestamp: 30, value: 0.92}, {timestamp: 45, value: 0.76}]},
        {label: 'flute', points: [{timestamp: 0, value: 0.02}, {timestamp: 15, value: 0.03}, {timestamp: 30, value: 0.01}, {timestamp: 45, value: 0.02}]},
      ],
    },
    segments: [],
    ...overrides,
  };
}

function section(id: string, name: string, startBeat: number, lengthBeats: number, ref?: ReferenceMoodAnalysis): SectionMarker {
  return {
    id,
    name,
    startBeat,
    lengthBeats,
    analysis: {
      mood: 'tense, intimate, and building',
      key: 'F major',
      meaning: 'The narrator sharpens the conflict.',
      productionCue: 'dry drums, muted guitar',
      productionDrivers: ['dry drums', 'muted guitar'],
      producerInsight: {
        intent: 'Keep the verse close while the threat builds.',
        arrangementMove: 'Use clipped drums and muted guitar responses between vocal phrases.',
        vocalTreatment: 'Keep the lead dry with one tucked double at the end.',
        soundPalette: 'dry drums, muted guitar, close vocal',
        mixFocus: 'Keep the vocal edge and drum pocket forward.',
        risk: 'Do not widen this section before the chorus.',
      },
      bpm: 96,
      bpmSource: 'public-context',
      lyricPreview: ['Nice to meet you'],
      lyrics: ['Nice to meet you'],
      reference: ref,
    },
  };
}

function renderLane(
  sections: SectionMarker[],
  pixelsPerBeat = 8,
  authoredLyrics?: LyricDocument,
  harmony: {scale?: {root: string; mode: string}; chord?: {symbol: string}} = {},
) {
  render(
    <TimelineLyricsLane
      visibleTimelineBeats={64}
      pixelsPerBeat={pixelsPerBeat}
      beatsPerBar={4}
      onJumpToBeat={jest.fn()}
      sections={sections}
      authoredLyrics={authoredLyrics}
      scale={harmony.scale}
      chord={harmony.chord}
    />,
  );
}

describe('TimelineLyricsLane', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders compact fallback evidence without BPM, key, or prose fields', () => {
    renderLane([section('verse', 'Verse', 0, 16)]);
    const chip = screen.getByRole('button', {name: 'Verse lyric analysis'});
    fireEvent.pointerEnter(chip, {clientX: 80});
    const tooltip = screen.getByRole('tooltip');

    expect(chip).toHaveTextContent('Nice to meet you');
    expect(chip).not.toHaveAttribute('title');
    expect(tooltip).toHaveTextContent('Song seed');
    expect(tooltip).toHaveTextContent('Nice to meet you');
    expect(tooltip).toHaveTextContent('1 line');
    expect(tooltip).toHaveTextContent('4 syllables');
    expect(tooltip).not.toHaveTextContent('Reference evidence');
    expect(tooltip).not.toHaveTextContent('Fallback section mood');
    expect(tooltip).toHaveTextContent('Mood tags');
    expect(tooltip).toHaveTextContent('tense');
    expect(tooltip).not.toHaveTextContent('Takeaway');
    expect(tooltip).not.toHaveTextContent('Try this');
    expect(tooltip).not.toHaveTextContent('F major');
    expect(tooltip).not.toHaveTextContent('96 BPM');
    expect(tooltip).not.toHaveTextContent('The narrator sharpens the conflict.');
    expect(tooltip).not.toHaveTextContent('Use clipped drums and muted guitar responses');
  });

  it('surfaces unavailable Musixmatch structure status in the popup source label', () => {
    const fallback = section('intro', 'Intro', 0, 16);
    fallback.analysis!.sectionSource = 'repetition';
    fallback.analysis!.sectionConfidence = 0.86;
    fallback.analysis!.structureNote = 'Musixmatch structure unavailable; using local lyric parser';
    renderLane([fallback]);

    fireEvent.pointerEnter(screen.getByRole('button', {name: 'Intro lyric analysis'}), {clientX: 80});
    const tooltip = screen.getByRole('tooltip');

    expect(tooltip).toHaveTextContent('detected from repetition');
    expect(tooltip).toHaveTextContent('Musixmatch structure unavailable');
  });

  it('keeps full song sections visible when lyrics are partial', () => {
    renderLane([
      section('intro', 'Intro', 0, 16),
      {...section('chorus-2', 'Chorus 2', 16, 32), analysis: {...section('x', 'x', 0, 1).analysis!, lyricPreview: [], lyrics: []}},
    ]);

    expect(screen.getByRole('button', {name: 'Intro lyric analysis'})).toHaveTextContent('Nice to meet you');
    expect(screen.getByRole('button', {name: 'Chorus 2 lyric analysis'})).toHaveTextContent('The narrator sharpens');
  });

  it('uses Cyanite mood curves for the hovered section and renders the instrument graph', () => {
    const ref = reference();
    renderLane([
      section('intro', 'Intro', 0, 16, ref),
      section('verse-1', 'Verse 1', 16, 16, ref),
      section('chorus', 'Chorus', 32, 32, ref),
    ]);

    const verse = screen.getByRole('button', {name: 'Verse 1 lyric analysis'});
    fireEvent.pointerEnter(verse, {clientX: 170});
    const tooltip = screen.getByRole('tooltip');
    const highlight = screen.getByTestId('instrument-section-highlight');

    expect(tooltip).toHaveTextContent('Bars 5-8 - 0:15-0:30');
    expect(tooltip).toHaveTextContent('sexy');
    expect(tooltip).toHaveTextContent('uplifting');
    expect(tooltip).toHaveTextContent('energetic');
    expect(tooltip).toHaveTextContent('Mood tags');
    expect(tooltip).not.toHaveTextContent('Reference evidence');
    expect(tooltip).not.toHaveTextContent('Cyanite reference');
    expect(tooltip).not.toHaveTextContent('Takeaway');
    expect(tooltip).not.toHaveTextContent('Try this');
    expect(tooltip).not.toHaveTextContent('aggressive');
    expect(screen.getByLabelText('Cyanite instrument graph')).toHaveTextContent('electronic drums');
    expect(screen.getByLabelText('Cyanite instrument graph').querySelector('.lyrics-graph-legend-row')).toBeInTheDocument();
    expect(screen.getByLabelText('Cyanite instrument graph')).not.toHaveTextContent('flute');
    expect(screen.getByLabelText('Instrument presence graph for Verse 1')).toHaveAttribute('viewBox', '0 0 240 124');
    expect(highlight).toHaveAttribute('x', '72');
    expect(highlight).toHaveAttribute('width', '54');
    expect(tooltip.querySelectorAll('.lyrics-graph-line')).toHaveLength(4);
    expect(tooltip.querySelector('.lyrics-graph-line')).toHaveAttribute('d', expect.stringContaining('C'));
  });

  it('falls back to Cyanite segment moods when mood curves are unavailable', () => {
    const ref = reference({
      curves: {
        instrumentsExtended: reference().curves!.instrumentsExtended,
      },
      segments: [
        {timestamp: 15, mood: 'aggressive', moodScore: 0.9},
        {timestamp: 20, mood: 'uplifting', moodScore: 0.72},
        {timestamp: 25, mood: 'energetic', moodScore: 0.68},
      ],
    });
    renderLane([section('intro', 'Intro', 0, 16, ref), section('verse', 'Verse', 16, 16, ref)]);

    fireEvent.pointerEnter(screen.getByRole('button', {name: 'Verse lyric analysis'}), {clientX: 180});
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).not.toHaveTextContent('Cyanite reference');
    expect(tooltip).toHaveTextContent('aggressive');
    expect(tooltip).toHaveTextContent('uplifting');
    expect(tooltip).toHaveTextContent('energetic');
  });

  it('uses section-width popups for wide sections and cursor popups for narrow sections', () => {
    renderLane([section('wide', 'Wide', 0, 32, reference()), section('narrow', 'Narrow', 40, 8, reference())], 10);

    fireEvent.pointerEnter(screen.getByRole('button', {name: 'Wide lyric analysis'}), {clientX: 120});
    let tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveStyle({width: '320px'});
    expect(tooltip).not.toHaveClass('is-cursor');

    fireEvent.pointerEnter(screen.getByRole('button', {name: 'Narrow lyric analysis'}), {clientX: 430});
    tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveStyle({width: '260px'});
    expect(tooltip).toHaveStyle({left: '380px'});
    expect(tooltip).toHaveClass('is-cursor');
  });

  it('keeps the popup visible when the pointer moves from the chip into the popup', () => {
    jest.useFakeTimers();
    renderLane([section('verse', 'Verse', 0, 16, reference())]);
    const chip = screen.getByRole('button', {name: 'Verse lyric analysis'});
    fireEvent.pointerEnter(chip, {clientX: 80});
    const tooltip = screen.getByRole('tooltip');

    fireEvent.pointerLeave(chip);
    fireEvent.pointerEnter(tooltip);
    act(() => { jest.advanceTimersByTime(160); });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('shows authored lyric text, counts, rhyme, and suggested chords in the shared popup', () => {
    const lyrics = defaultLyricDocument();
    lyrics.sections[0] = {
      id: 'hook',
      name: 'Hook',
      startBeat: 0,
      endBeat: 8,
      lines: [
        {id: 'line-a', text: 'come back tonight', startBeat: 0, timingSource: 'manual'},
        {id: 'line-b', text: 'meet me in the light', startBeat: 4, timingSource: 'manual'},
      ],
    };
    renderLane([], 10, lyrics, {scale: {root: 'C', mode: 'major'}});

    fireEvent.pointerEnter(screen.getByRole('button', {name: 'Hook authored lyrics'}), {clientX: 80});
    const tooltip = screen.getByRole('tooltip');

    expect(tooltip).toHaveTextContent('Authored');
    expect(tooltip).toHaveTextContent('2 lines');
    expect(tooltip).toHaveTextContent('9 syllables');
    expect(tooltip).toHaveTextContent('A A');
    expect(screen.getByText('Rhyme')).toHaveAttribute('title', expect.stringContaining('A marks'));
    expect(tooltip).toHaveTextContent('come back tonight');
    expect(tooltip).toHaveTextContent('Suggested progression');
    expect(tooltip).toHaveTextContent('C - G - Am - F');
  });

  it('keeps a pinned popup open until closed', () => {
    jest.useFakeTimers();
    renderLane([section('verse', 'Verse', 0, 16, reference())]);
    const chip = screen.getByRole('button', {name: 'Verse lyric analysis'});
    fireEvent.pointerEnter(chip, {clientX: 80});
    fireEvent.click(screen.getByRole('button', {name: 'Pin lyric popup'}));

    fireEvent.pointerLeave(chip);
    act(() => { jest.advanceTimersByTime(160); });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: 'Close lyric popup'}));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('prefers verified chord progressions over project chords or suggestions', () => {
    const verified = section('chorus', 'Chorus', 0, 16);
    verified.analysis!.chordProgression = {source: 'manual', chords: ['Am', 'F', 'C', 'G'], confidence: 0.92};
    renderLane([verified], 8, undefined, {scale: {root: 'C', mode: 'major'}, chord: {symbol: 'Cmaj7'}});

    fireEvent.pointerEnter(screen.getByRole('button', {name: 'Chorus lyric analysis'}), {clientX: 80});
    const tooltip = screen.getByRole('tooltip');

    expect(tooltip).toHaveTextContent('Verified progression');
    expect(tooltip).toHaveTextContent('Am - F - C - G');
    expect(tooltip).not.toHaveTextContent('Cmaj7');
    expect(tooltip).not.toHaveTextContent('Suggested progression');
  });
});
