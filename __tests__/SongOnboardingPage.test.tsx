import React from 'react';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

import {SongOnboardingPage} from '../src/web/components/SongOnboardingPage';
import {
  analyzeSongSeed,
  getSongSeedLyrics,
  lookupSongSeedBpmKey,
  searchSongSeed,
} from '../src/native/songSeedApi';

jest.mock('../src/native/songSeedApi', () => ({
  analyzeSongSeed: jest.fn(),
  analyzeSongSeedReference: jest.fn(),
  getSongSeedLyrics: jest.fn(),
  lookupSongSeedBpmKey: jest.fn(),
  searchSongSeed: jest.fn(),
}));

const searchMock = searchSongSeed as jest.Mock;
const lyricsMock = getSongSeedLyrics as jest.Mock;
const bpmMock = lookupSongSeedBpmKey as jest.Mock;
const analyzeMock = analyzeSongSeed as jest.Mock;

describe('SongOnboardingPage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    searchMock.mockResolvedValue({
      ok: true,
      tracks: [{
        id: 'mxm-1',
        title: 'Halo',
        artist: 'Beyonce',
        album: 'I Am Sasha Fierce',
        albumCoverUrl: 'https://images.example.test/halo.jpg',
        releaseYear: '2008',
        hasLyrics: true,
        source: 'musixmatch',
      }],
    });
    lyricsMock.mockResolvedValue({
      ok: true,
      trackId: 'mxm-1',
      lyrics: 'Remember those walls\nI found a way',
    });
    bpmMock.mockResolvedValue({
      ok: true,
      title: 'Halo',
      artist: 'Beyonce',
      bpm: 80,
      key: 'A major',
      source: 'getsongbpm',
      confidence: 0.9,
      candidates: [{
        title: 'Halo',
        artist: 'Beyonce',
        bpm: 80,
        key: 'A major',
        source: 'getsongbpm',
        confidence: 0.9,
        matchReason: 'title and artist match',
      }],
    });
    analyzeMock.mockResolvedValue({
      ok: true,
      source: 'openrouter',
      analysis: {
        title: 'Halo - Beyonce',
        bpm: 80,
        scale: {root: 'A', mode: 'major'},
        keySource: 'getsongbpm (90% confidence)',
        bpmKey: {source: 'getsongbpm', confidence: 0.9},
        sections: [
          {
            id: 'song-idea-0',
            name: 'Verse',
            bars: 4,
            lyricRange: {startLine: 0, endLine: 1},
            lyrics: ['Remember those walls', 'I found a way'],
            lyricPreview: ['Remember those walls', 'I found a way'],
            mood: 'wide-eyed and devotional',
            meaning: 'The lyric frames surrender as release.',
            productionDrivers: ['piano', 'vocal lift'],
            productionCue: 'piano, vocal lift',
            producerInsight: {
              intent: 'Make the first section feel intimate before the lift.',
              arrangementMove: 'Use piano stabs and a restrained kick to leave room for the vocal.',
              vocalTreatment: 'Keep the vocal close with a short plate tucked behind it.',
              soundPalette: 'piano, restrained kick, intimate lead vocal',
              mixFocus: 'Keep the vocal and piano transient in front.',
              risk: 'Do not make the verse feel like the chorus too early.',
            },
            confidence: 0.82,
          },
          {
            id: 'song-idea-1',
            name: 'Chorus',
            bars: 8,
            lyricRange: {startLine: 2, endLine: 2},
            lyrics: ['Everywhere I am looking now'],
            lyricPreview: ['Everywhere I am looking now'],
            mood: 'open and resolved',
            meaning: 'The hook opens the emotional release.',
            productionDrivers: ['wide drums', 'stacked vocals'],
            productionCue: 'wide drums, stacked vocals',
            confidence: 0.84,
          },
          {
            id: 'song-idea-2',
            name: 'Bridge',
            bars: 8,
            lyricRange: {startLine: 0, endLine: 0},
            lyrics: [],
            lyricPreview: [],
            mood: 'suspended and unresolved',
            meaning: 'A lyric-light turn creates tension before the final hook.',
            productionDrivers: ['filtered drums', 'held synth'],
            productionCue: 'filtered drums, held synth',
            confidence: 0.72,
          },
        ],
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('shows a centered search-only idea screen before a song is selected', () => {
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={jest.fn()} />);

    expect(screen.getByRole('heading', {name: 'Create a masterpiece.'})).toBeInTheDocument();
    fireEvent.click(screen.getByText('I have an idea already'));

    expect(screen.queryByText('AI Producer Core')).not.toBeInTheDocument();
    expect(screen.queryByText(/Start with silence/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Lyric analysis preview')).not.toBeInTheDocument();
    expect(screen.queryByText('Analyse selected song')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search for a song')).toBeInTheDocument();
    expect(screen.getByText(/Live Musixmatch search is enabled/i)).toBeInTheDocument();
    expect(screen.getByText(/Cached Cyanite pre-runs: Blank Space - Taylor Swift/i)).toBeInTheDocument();
    const backButton = screen.getByRole('button', {name: 'Back'});
    expect(backButton).toHaveAttribute('aria-label', 'Back');
    expect(backButton).not.toHaveTextContent('Back');
  });

  it('searches, selects a track, renders lyrics, and starts analysis', async () => {
    const openSongIdeaProject = jest.fn();
    const {container} = render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={openSongIdeaProject} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {
      target: {value: 'Halo'},
    });

    await act(async () => {
      jest.advanceTimersByTime(320);
    });

    expect(await screen.findByText('Halo')).toBeInTheDocument();
    expect(container.querySelector('img.song-search-cover')).toHaveAttribute('src', 'https://images.example.test/halo.jpg');
    await act(async () => {
      fireEvent.click(screen.getByRole('option', {name: /Halo/i}));
    });

    expect(screen.queryByLabelText('Search for a song')).not.toBeInTheDocument();
    expect(screen.queryByText('Analyse selected song')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.song-analysis-surface')).toHaveLength(1);
    expect(await screen.findByLabelText('Remember those walls')).toBeInTheDocument();
    expect(container.querySelectorAll('.lyrics-spotlight-section')).toHaveLength(2);
    await waitFor(() => expect(bpmMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Halo',
      artist: 'Beyonce',
      album: 'I Am Sasha Fierce',
      releaseYear: '2008',
    })));

    expect(screen.queryByRole('button', {name: /Open DAW with this structure/i})).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Fast Forward/i})).toBeEnabled();
    await waitFor(() => expect(analyzeMock).toHaveBeenCalledWith({
      track: expect.objectContaining({title: 'Halo'}),
      lyrics: 'Remember those walls\nI found a way',
      bpmKeyCandidates: expect.arrayContaining([expect.objectContaining({bpm: 80})]),
    }));
    expect(await screen.findByDisplayValue(80)).toBeInTheDocument();
    expect(screen.queryByText('82%')).not.toBeInTheDocument();
    const lyricsPanel = screen.getByLabelText('Lyric analysis preview');
    expect(lyricsPanel.querySelector('.lyrics-wheel')).toBeInTheDocument();
    expect(within(lyricsPanel).queryByText('Verse')).not.toBeInTheDocument();
    expect(within(lyricsPanel).queryByText('Chorus')).not.toBeInTheDocument();
    expect(await screen.findByText('wide-eyed and devotional')).toBeInTheDocument();
    expect(await screen.findByText('Production move')).toBeInTheDocument();
    expect(screen.getByText('Mix focus')).toBeInTheDocument();
    expect(screen.getByText(/Use piano stabs and a restrained kick/i)).toBeInTheDocument();

    for (let step = 0; step < 12; step += 1) await act(async () => { jest.advanceTimersByTime(2500); });
    await waitFor(() => expect(openSongIdeaProject).toHaveBeenCalledTimes(1));
    const openedAnalysis = openSongIdeaProject.mock.calls[0][0];
    expect(openedAnalysis.sections).toHaveLength(10);
    expect(openedAnalysis.sections.map((section: {name: string}) => section.name)).toEqual(expect.arrayContaining([
      'Intro',
      'Verse 1',
      'Pre-Chorus 1',
      'Chorus 1',
      'Verse 2',
      'Final Chorus',
      'Outro',
    ]));
  });

  it('opens the analysis surface immediately while metadata is still loading', async () => {
    let resolveLyrics: (value: unknown) => void = () => undefined;
    bpmMock.mockReturnValue(new Promise(() => undefined));
    lyricsMock.mockReturnValue(new Promise(resolve => { resolveLyrics = resolve; }));
    analyzeMock.mockReturnValue(new Promise(() => undefined));
    const {container} = render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={jest.fn()} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {
      target: {value: 'Halo'},
    });

    await act(async () => {
      jest.advanceTimersByTime(320);
    });

    const loadingOption = await screen.findByRole('option', {name: /Halo/i});
    await act(async () => {
      fireEvent.click(loadingOption);
    });

    expect(container.querySelectorAll('.song-analysis-surface')).toHaveLength(1);
    expect(screen.queryByLabelText('Search for a song')).not.toBeInTheDocument();
    expect(screen.queryByText('Analyse selected song')).not.toBeInTheDocument();
    expect(await screen.findByText('Checking metadata')).toBeInTheDocument();

    await act(async () => {
      resolveLyrics({
        ok: true,
        trackId: 'mxm-1',
        lyrics: 'Remember those walls\nI found a way',
      });
    });
    await act(async () => {
      jest.advanceTimersByTime(1900);
    });

    expect(await screen.findByText('Analysing sections')).toBeInTheDocument();
    expect(screen.getByText('Waiting for online BPM/key')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /Open DAW with this structure/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /Fast Forward/i})).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Search for a song')).not.toBeInTheDocument();
  });

  it('does not overwrite edited metadata when background lookup finishes', async () => {
    let resolveBpm: (value: unknown) => void = () => undefined;
    bpmMock.mockReturnValue(new Promise(resolve => { resolveBpm = resolve; }));
    render(
      <SongOnboardingPage
        onOpenEmptyProject={jest.fn()}
        onOpenSongIdeaProject={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {
      target: {value: 'Halo'},
    });

    await act(async () => {
      jest.advanceTimersByTime(320);
    });

    const editableOption = await screen.findByRole('option', {name: /Halo/i});
    await act(async () => {
      fireEvent.click(editableOption);
    });
    expect(await screen.findByLabelText('Remember those walls')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(1900);
    });

    const bpmInput = await screen.findByLabelText('BPM');
    fireEvent.change(bpmInput, {target: {value: '123'}});
    await act(async () => resolveBpm({
      ok: true,
      title: 'Halo',
      artist: 'Beyonce',
      bpm: 80,
      key: 'A major',
      source: 'getsongbpm',
      confidence: 0.9,
      candidates: [],
    }));

    await waitFor(() => expect(screen.getByDisplayValue(123)).toBeInTheDocument());
    expect(screen.queryByDisplayValue(80)).not.toBeInTheDocument();
  });
});
