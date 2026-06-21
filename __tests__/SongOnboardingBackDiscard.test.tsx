import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';

import {SongOnboardingPage} from '../src/web/components/SongOnboardingPage';
import {
  analyzeSongSeed,
  getSongSeedLyrics,
  lookupSongSeedBpmKey,
  searchSongSeed,
} from '../src/native/songSeedApi';

jest.mock('../src/native/songSeedApi', () => ({
  analyzeSongSeed: jest.fn(),
  analyzeSongSeedReference: jest.fn(() => new Promise(() => undefined)),
  getSongSeedLyrics: jest.fn(),
  lookupSongSeedBpmKey: jest.fn(),
  searchSongSeed: jest.fn(),
}));

const searchMock = searchSongSeed as jest.Mock;
const lyricsMock = getSongSeedLyrics as jest.Mock;
const bpmMock = lookupSongSeedBpmKey as jest.Mock;
const analyzeMock = analyzeSongSeed as jest.Mock;

describe('SongOnboardingPage back discard confirmation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    searchMock.mockResolvedValue({
      ok: true,
      tracks: [{id: 'mxm-1', title: 'Halo', artist: 'Beyonce', hasLyrics: true, source: 'musixmatch'}],
    });
    bpmMock.mockReturnValue(new Promise(() => undefined));
    analyzeMock.mockReturnValue(new Promise(() => undefined));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('confirms before leaving active analysis and ignores late results after discard', async () => {
    let resolveLyrics: (value: unknown) => void = () => undefined;
    lyricsMock.mockReturnValue(new Promise(resolve => { resolveLyrics = resolve; }));
    render(<SongOnboardingPage onOpenEmptyProject={jest.fn()} onOpenSongIdeaProject={jest.fn()} />);

    fireEvent.click(screen.getByText('I have an idea already'));
    fireEvent.change(screen.getByLabelText('Search for a song'), {target: {value: 'Halo'}});
    await act(async () => { jest.advanceTimersByTime(320); });
    const option = await screen.findByRole('option', {name: /Halo/i});
    await act(async () => { fireEvent.click(option); });

    expect(await screen.findByText('Checking metadata')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Back'}));
    expect(screen.getByRole('dialog', {name: 'Discard analysis?'})).toBeInTheDocument();
    const dialogButtons = screen.getByRole('dialog', {name: 'Discard analysis?'}).querySelectorAll('button');
    expect(dialogButtons[0]).toHaveTextContent('Discard analysis');
    expect(dialogButtons[1]).toHaveTextContent('Keep analysing');
    expect(dialogButtons[1]).toHaveClass('primary');

    fireEvent.click(screen.getByText('Keep analysing'));
    expect(screen.queryByRole('dialog', {name: 'Discard analysis?'})).not.toBeInTheDocument();
    expect(screen.getByText('Checking metadata')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: 'Back'}));
    fireEvent.click(screen.getByText('Discard analysis'));
    expect(screen.getByRole('heading', {name: 'Create a masterpiece.'})).toBeInTheDocument();
    expect(screen.queryByLabelText('Lyric analysis preview')).not.toBeInTheDocument();

    await act(async () => {
      resolveLyrics({ok: true, trackId: 'mxm-1', lyrics: 'Remember those walls\nI found a way'});
      jest.advanceTimersByTime(2500);
    });
    expect(screen.getByRole('heading', {name: 'Create a masterpiece.'})).toBeInTheDocument();
    expect(screen.queryByText('Analysing sections')).not.toBeInTheDocument();
  });
});
