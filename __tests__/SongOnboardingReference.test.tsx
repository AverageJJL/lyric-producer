import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';

import {SongOnboardingPage} from '../src/web/components/SongOnboardingPage';
import {
  analyzeSongSeed,
  analyzeSongSeedReference,
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
const referenceMock = analyzeSongSeedReference as jest.Mock;

function referenceAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'cyanite',
    libraryTrackId: 'cyanite-42',
    source: {
      kind: 'youtube',
      url: 'https://www.youtube.com/watch?v=halo',
      videoId: 'halo',
      title: 'Beyonce - Halo (Official Audio)',
      channelTitle: 'Beyonce - Topic',
      confidence: 0.94,
    },
    caption: 'A dark energetic reference with driving synth percussion.',
    bpm: 122,
    key: 'A_MINOR',
    moodTags: ['dark', 'energetic'],
    moodAdvancedTags: ['tense'],
    movementTags: ['driving'],
    characterTags: ['mysterious'],
    genreTags: ['electronicDance'],
    subgenreTags: ['synthPop'],
    instrumentTags: ['synth', 'percussion'],
    voiceTags: ['female'],
    freeGenreTags: ['glossy pop'],
    scoreMaps: {
      advancedGenre: {electronicDance: 0.8},
      instrumentsExtended: {synth: 0.7, percussion: 0.9},
    },
    segments: [
      {timestamp: 0, mood: 'dark', moodScore: 0.86, valence: -0.3, arousal: 0.7, genre: 'electronicDance', instrument: 'synth', instrumentScore: 0.7},
      {timestamp: 15, mood: 'energetic', moodScore: 0.78, valence: 0.1, arousal: 0.8, genre: 'electronicDance', instrument: 'percussion', instrumentScore: 0.9},
    ],
    ...overrides,
  };
}

describe('SongOnboardingPage Cyanite reference analysis', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    searchMock.mockResolvedValue({
      ok: true,
      tracks: [{id: 'mxm-1', title: 'Halo', artist: 'Beyonce', hasLyrics: true, source: 'musixmatch'}],
    });
    lyricsMock.mockResolvedValue({ok: true, trackId: 'mxm-1', lyrics: 'Remember those walls'});
    bpmMock.mockResolvedValue({
      ok: true,
      title: 'Halo',
      artist: 'Beyonce',
      bpm: 80,
      key: 'A major',
      source: 'getsongbpm',
      confidence: 0.9,
      candidates: [],
    });
    analyzeMock.mockResolvedValue({ok: true, source: 'fallback', analysis: {
      title: 'Halo - Beyonce',
      bpm: 80,
      scale: {root: 'A', mode: 'major'},
      keySource: 'getsongbpm',
      bpmKey: {source: 'getsongbpm', confidence: 0.9},
      sections: [],
    }});
    referenceMock.mockResolvedValue({ok: true, analysis: referenceAnalysis()});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('renders Cyanite chips and carries normalized reference metadata into the DAW open request', async () => {
    const openSongIdeaProject = jest.fn();
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={openSongIdeaProject} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {target: {value: 'Halo'}});
    await act(async () => { jest.advanceTimersByTime(320); });
    const option = await screen.findByRole('option', {name: /Halo/i});
    await act(async () => { fireEvent.click(option); });
    await screen.findByLabelText('Remember those walls');

    expect(referenceMock).toHaveBeenCalledWith({track: expect.objectContaining({title: 'Halo', artist: 'Beyonce'}), allowCreditSpend: true});
    expect(await screen.findByLabelText('Cyanite reference analysis')).toBeInTheDocument();
    expect(screen.getByText('A dark energetic reference with driving synth percussion.')).toBeInTheDocument();
    expect(screen.getByText('Beyonce - Halo (Official Audio)')).toBeInTheDocument();
    expect(screen.getByText('122 BPM / a minor')).toBeInTheDocument();
    expect(screen.getAllByText('dark').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/driving/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Cyanite section reference')).not.toBeInTheDocument();

    expect(screen.queryByRole('button', {name: /Open DAW with this structure/i})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /Fast Forward/i}));
    expect(openSongIdeaProject).toHaveBeenCalledWith(expect.objectContaining({
      bpm: 122,
      scale: {root: 'A', mode: 'minor'},
      bpmKey: expect.objectContaining({source: 'cyanite'}),
      reference: expect.objectContaining({libraryTrackId: 'cyanite-42'}),
    }));
  });

  it('starts Cyanite analysis automatically without spend controls', async () => {
    referenceMock.mockResolvedValue({ok: true, cacheStatus: 'analyzed', analysis: referenceAnalysis()});
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={jest.fn()} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {target: {value: 'Halo'}});
    await act(async () => { jest.advanceTimersByTime(320); });
    const option = await screen.findByRole('option', {name: /Halo/i});
    await act(async () => { fireEvent.click(option); });

    await screen.findByText('A dark energetic reference with driving synth percussion.');
    expect(referenceMock).toHaveBeenLastCalledWith({track: expect.objectContaining({title: 'Halo'}), allowCreditSpend: true});
    expect(screen.queryByRole('button', {name: /Use 1 Cyanite analysis/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /Skip Cyanite/i})).not.toBeInTheDocument();
  });

  it('does not show Cyanite spend controls while automatic analysis is pending', async () => {
    let resolveReference: (value: unknown) => void = () => undefined;
    referenceMock.mockReturnValue(new Promise(resolve => { resolveReference = resolve; }));
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={jest.fn()} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {target: {value: 'Halo'}});
    await act(async () => { jest.advanceTimersByTime(320); });
    const option = await screen.findByRole('option', {name: /Halo/i});
    await act(async () => { fireEvent.click(option); });
    expect(screen.queryByRole('button', {name: /Use 1 Cyanite analysis/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /Skip Cyanite/i})).not.toBeInTheDocument();

    await act(async () => {
      resolveReference({ok: true, cacheStatus: 'analyzed', analysis: referenceAnalysis()});
    });
    await screen.findByText('A dark energetic reference with driving synth percussion.');
  });

  it('shows the demo-video message when Cyanite credits are exhausted', async () => {
    referenceMock.mockResolvedValue({
      ok: false,
      code: 'limit_exceeded',
      error: 'Monthly credit limit exceeded.',
    });
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={jest.fn()} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {target: {value: 'Halo'}});
    await act(async () => { jest.advanceTimersByTime(320); });
    const option = await screen.findByRole('option', {name: /Halo/i});
    await act(async () => { fireEvent.click(option); });

    expect(await screen.findByText('Cyanite usage limits reached in the public demo. Please see the demo video for how this feature works.')).toBeInTheDocument();
    expect(screen.queryByText('Monthly credit limit exceeded.')).not.toBeInTheDocument();
  });

  it('still applies Cyanite Eb key after the user edits BPM', async () => {
    let resolveReference: (value: unknown) => void = () => undefined;
    referenceMock.mockReturnValue(new Promise(resolve => { resolveReference = resolve; }));
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={jest.fn()} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {target: {value: 'Halo'}});
    await act(async () => { jest.advanceTimersByTime(320); });
    const option = await screen.findByRole('option', {name: /Halo/i});
    await act(async () => { fireEvent.click(option); });
    expect(await screen.findByDisplayValue(80)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('BPM'), {target: {value: '111'}});

    await act(async () => {
      resolveReference({ok: true, analysis: referenceAnalysis({key: 'ebMajor'})});
    });

    expect(screen.getByLabelText('BPM')).toHaveValue(111);
    expect(screen.getByLabelText('Key')).toHaveValue('Eb');
    expect(screen.getByLabelText('Scale')).toHaveValue('major');
  });

  it('does not overwrite a user-edited key when Cyanite later resolves', async () => {
    let resolveReference: (value: unknown) => void = () => undefined;
    referenceMock.mockReturnValue(new Promise(resolve => { resolveReference = resolve; }));
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={jest.fn()} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {target: {value: 'Halo'}});
    await act(async () => { jest.advanceTimersByTime(320); });
    const option = await screen.findByRole('option', {name: /Halo/i});
    await act(async () => { fireEvent.click(option); });
    expect(await screen.findByDisplayValue(80)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Key'), {target: {value: 'D'}});

    await act(async () => {
      resolveReference({ok: true, analysis: referenceAnalysis({key: 'E_FLAT_MAJOR'})});
    });

    expect(screen.getByLabelText('BPM')).toHaveValue(122);
    expect(screen.getByLabelText('Key')).toHaveValue('D');
  });

  it('keeps song analysis gated while the automatic reference analysis is pending', async () => {
    let resolveReference: (value: unknown) => void = () => undefined;
    referenceMock.mockReturnValue(new Promise(resolve => { resolveReference = resolve; }));
    const openSongIdeaProject = jest.fn();
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={openSongIdeaProject} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {target: {value: 'Halo'}});
    await act(async () => { jest.advanceTimersByTime(320); });
    const option = await screen.findByRole('option', {name: /Halo/i});
    await act(async () => { fireEvent.click(option); });

    expect(await screen.findByText('Finding YouTube reference')).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(12000); });

    expect(openSongIdeaProject).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', {name: /Open DAW with this structure/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /Fast Forward/i})).not.toBeInTheDocument();

    await act(async () => {
      resolveReference({ok: false, code: 'not_found', error: 'No reliable YouTube reference match was found.'});
    });
    expect(await screen.findByText('No reliable YouTube reference match was found.')).toBeInTheDocument();
    for (let step = 0; step < 12; step += 1) await act(async () => { jest.advanceTimersByTime(2500); });

    await waitFor(() => expect(openSongIdeaProject).toHaveBeenCalledWith(expect.not.objectContaining({
      reference: expect.anything(),
    })));
  });
});
