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

function metadata(title: string, artist: string, bpm: number, key: string) {
  return {
    ok: true,
    title,
    artist,
    bpm,
    key,
    source: 'getsongbpm',
    confidence: 0.9,
    candidates: [{title, artist, bpm, key, source: 'getsongbpm', confidence: 0.9, matchReason: 'match'}],
  };
}

function fallbackAnalysis(title: string) {
  return {
    ok: true,
    source: 'fallback',
    analysis: {
      title,
      bpm: 100,
      scale: {root: 'C', mode: 'major'},
      keySource: 'fallback',
      bpmKey: {source: 'fallback', confidence: 0.3},
      sections: [],
    },
  };
}

describe('SongOnboardingPage metadata flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    analyzeMock.mockResolvedValue(fallbackAnalysis('enriched'));
    referenceMock.mockResolvedValue({ok: false, code: 'not_found', error: 'No reliable YouTube reference match was found.'});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('waits briefly for quick metadata before creating the first analysis', async () => {
    searchMock.mockResolvedValue({
      ok: true,
      tracks: [{id: 'mxm-halo', title: 'Halo', artist: 'Beyonce', hasLyrics: true, source: 'musixmatch'}],
    });
    lyricsMock.mockResolvedValue({ok: true, trackId: 'mxm-halo', lyrics: 'Remember those walls'});
    bpmMock.mockResolvedValue(metadata('Halo', 'Beyonce', 80, 'A major'));
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={jest.fn()} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {target: {value: 'Halo'}});
    await act(async () => { jest.advanceTimersByTime(320); });
    const option = await screen.findByRole('option', {name: /Halo/i});
    await act(async () => { fireEvent.click(option); });

    expect(await screen.findByDisplayValue(80)).toBeInTheDocument();
    await waitFor(() => expect(analyzeMock).toHaveBeenCalledWith(expect.objectContaining({
      bpmKeyCandidates: expect.arrayContaining([expect.objectContaining({bpm: 80})]),
    })));
  });

  it('shows GetSongBPM failures alongside section analysis warnings', async () => {
    searchMock.mockResolvedValue({
      ok: true,
      tracks: [{id: 'mxm-dreams', title: 'Dreams', artist: 'Fleetwood Mac', hasLyrics: true, source: 'musixmatch'}],
    });
    lyricsMock.mockResolvedValue({ok: true, trackId: 'mxm-dreams', lyrics: 'Thunder only happens'});
    bpmMock.mockResolvedValue({ok: false, code: 'unauthorized', error: 'GetSongBPM returned 401.'});
    analyzeMock.mockResolvedValueOnce({...fallbackAnalysis('Dreams'), warning: 'OpenRouter analysis failed.'});
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={jest.fn()} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {target: {value: 'Dreams'}});
    await act(async () => { jest.advanceTimersByTime(320); });
    const option = await screen.findByRole('option', {name: /Dreams/i});
    await act(async () => { fireEvent.click(option); });

    await waitFor(() => expect(screen.getByText(/Online BPM\/key unavailable: GetSongBPM returned 401.; OpenRouter analysis failed./)).toBeInTheDocument());
  });

  it('keeps Fast Forward hidden after skipping Cyanite until online BPM/key resolves', async () => {
    let resolveMetadata: (value: unknown) => void = () => undefined;
    searchMock.mockResolvedValue({
      ok: true,
      tracks: [{id: 'mxm-umbrella', title: 'Umbrella', artist: 'Rihanna', hasLyrics: true, source: 'musixmatch'}],
    });
    lyricsMock.mockResolvedValue({ok: true, trackId: 'mxm-umbrella', lyrics: 'Under my umbrella'});
    bpmMock.mockReturnValue(new Promise(resolve => { resolveMetadata = resolve; }));
    referenceMock.mockResolvedValue({ok: false, code: 'confirmation_required', error: 'Spend 1 Cyanite analysis credit?', source: {
      kind: 'youtube',
      url: 'https://www.youtube.com/watch?v=umbrella',
      videoId: 'umbrella',
      title: 'Rihanna - Umbrella',
      channelTitle: 'Rihanna',
      confidence: 0.92,
    }});
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={jest.fn()} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {target: {value: 'Umbrella'}});
    await act(async () => { jest.advanceTimersByTime(320); });
    const option = await screen.findByRole('option', {name: /Umbrella/i});
    await act(async () => { fireEvent.click(option); });
    fireEvent.click(await screen.findByRole('button', {name: /Skip Cyanite/i}));

    expect(screen.queryByRole('button', {name: /Fast Forward/i})).not.toBeInTheDocument();
    await act(async () => {
      resolveMetadata({...metadata('Umbrella', 'Rihanna', 87, 'C# major'), source: 'openrouter-web'});
    });

    expect(await screen.findByDisplayValue(87)).toBeInTheDocument();
    expect(await screen.findByRole('button', {name: /Fast Forward/i})).toBeInTheDocument();
  });

  it('ignores late metadata and lyrics from a previously selected song', async () => {
    let resolveHaloLyrics: (value: unknown) => void = () => undefined;
    let resolveXoLyrics: (value: unknown) => void = () => undefined;
    let resolveHaloBpm: (value: unknown) => void = () => undefined;
    let resolveXoBpm: (value: unknown) => void = () => undefined;
    searchMock.mockResolvedValue({
      ok: true,
      tracks: [
        {id: 'mxm-halo', title: 'Halo', artist: 'Beyonce', hasLyrics: true, source: 'musixmatch'},
        {id: 'mxm-xo', title: 'XO', artist: 'Beyonce', hasLyrics: true, source: 'musixmatch'},
      ],
    });
    lyricsMock.mockImplementation((trackId: string) => new Promise(resolve => {
      if (trackId === 'mxm-halo') resolveHaloLyrics = resolve;
      else resolveXoLyrics = resolve;
    }));
    bpmMock.mockImplementation(({title}: {title?: string}) => new Promise(resolve => {
      if (title === 'Halo') resolveHaloBpm = resolve;
      else resolveXoBpm = resolve;
    }));
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={jest.fn()} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {target: {value: 'Beyonce'}});
    await act(async () => { jest.advanceTimersByTime(320); });
    const options = await screen.findAllByRole('option');
    await act(async () => {
      fireEvent.click(options[0]);
      fireEvent.click(options[1]);
      resolveXoBpm(metadata('XO', 'Beyonce', 99, 'C major'));
      resolveXoLyrics({ok: true, trackId: 'mxm-xo', lyrics: 'XO line'});
    });

    expect(await screen.findByDisplayValue(99)).toBeInTheDocument();
    expect(await screen.findByLabelText('XO line')).toBeInTheDocument();
    await act(async () => {
      resolveHaloBpm(metadata('Halo', 'Beyonce', 80, 'A major'));
      resolveHaloLyrics({ok: true, trackId: 'mxm-halo', lyrics: 'Halo line'});
      jest.advanceTimersByTime(2200);
    });

    expect(screen.getByDisplayValue(99)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(80)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Halo line')).not.toBeInTheDocument();
  });
});
