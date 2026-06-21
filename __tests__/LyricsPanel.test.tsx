import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

import {checkSongSeedLyricsSimilarity} from '../src/native/songSeedApi';
import {defaultLyricDocument} from '../src/store/lyrics';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {LyricsPanel} from '../src/web/components/LyricsPanel';
import {WorkspaceNavButtons} from '../src/web/components/WorkspaceNavButtons';

jest.mock('../src/native/songSeedApi', () => ({
  checkSongSeedLyricsSimilarity: jest.fn(async () => ({
    ok: true,
    report: {
      checkedAt: '2026-06-20T12:00:00.000Z',
      risk: 'low',
      matches: [],
      note: 'No close lyric matches were found from the configured provider.',
    },
  })),
}));

function resetStore(): void {
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    tempoMap: [],
    meterMap: [],
    tracks: [],
    patterns: {},
    blocks: [],
    playheadBeat: 8,
    playheadSeconds: 4,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    snapGrid: DEFAULT_SNAP_GRID,
    lyrics: defaultLyricDocument(),
  });
}

describe('LyricsPanel', () => {
  beforeEach(resetStore);

  it('adds, renames, deletes sections, and splits pasted lines', () => {
    render(<LyricsPanel />);

    fireEvent.change(screen.getByLabelText('[Section 1] lyric line'), {target: {value: 'one line\ntwo line'}});
    const nameInput = screen.getByLabelText('[Section 1] name');
    fireEvent.change(nameInput, {target: {value: '[Hook]'}});
    fireEvent.blur(nameInput);
    fireEvent.click(screen.getByRole('button', {name: 'Add lyric section'}));

    expect(useDAWStore.getState().lyrics.sections.map(section => section.name))
      .toEqual(['[Hook]', '[Section 2]']);
    expect(useDAWStore.getState().lyrics.sections[0]?.lines.map(line => line.text))
      .toEqual(['one line', 'two line']);

    fireEvent.click(screen.getByRole('button', {name: 'Delete [Section 2]'}));
    expect(useDAWStore.getState().lyrics.sections).toHaveLength(1);
  });

  it('stamps the selected line and syncs section line timings', () => {
    render(<LyricsPanel />);
    const lineInput = screen.getByLabelText('[Section 1] lyric line');

    fireEvent.change(lineInput, {target: {value: 'first line\nsecond lyric line'}});
    fireEvent.focus(lineInput);
    fireEvent.click(screen.getByRole('button', {name: 'Stamp selected line'}));

    expect(useDAWStore.getState().lyrics.sections[0]?.lines[0]?.startBeat).toBe(8);

    fireEvent.click(screen.getByRole('button', {name: 'Sync lyric timings'}));
    const lines = useDAWStore.getState().lyrics.sections[0]?.lines ?? [];
    expect(lines[0]?.startBeat).toBe(0);
    expect(lines[1]?.startBeat).toBe(2);
    expect(lines[1]?.timingSource).toBe('estimated');
    expect(useDAWStore.getState().lyrics.sections[0]?.endBeat).toBeCloseTo(4.25);
  });

  it('moves focus to the new lyric line when Enter is pressed', async () => {
    render(<LyricsPanel />);

    const lineInput = screen.getByLabelText('[Section 1] lyric line');
    fireEvent.focus(lineInput);
    fireEvent.keyDown(lineInput, {key: 'Enter'});

    await waitFor(() => {
      const lineInputs = screen.getAllByLabelText('[Section 1] lyric line');
      expect(lineInputs).toHaveLength(2);
      expect(document.activeElement).toBe(lineInputs[1]);
    });
  });

  it('keeps only one line stamp action and one timing sync action in the toolbar', () => {
    render(<LyricsPanel />);

    expect(screen.getByRole('button', {name: 'Stamp selected line'}))
      .toHaveAttribute('title', 'Set the selected lyric line to the current playhead time.');
    expect(screen.getByRole('button', {name: 'Sync lyric timings'}))
      .toHaveAttribute('title', 'Auto-fill section ends and line start times from lyric length.');
    const similarityButton = screen.getByRole('button', {name: 'Check Similarity'});
    expect(similarityButton)
      .toHaveAttribute('title', 'Compare your lyrics against candidate songs and show similarity risk.');
    expect(similarityButton.querySelector('svg')).toBeNull();
    expect(screen.queryByRole('button', {name: 'Stamp section start'})).toBeNull();
    expect(screen.queryByRole('button', {name: 'Estimate section timing'})).toBeNull();
  });

  it('shows a loading spinner while checking lyric similarity', () => {
    (checkSongSeedLyricsSimilarity as jest.Mock).mockImplementationOnce(() => new Promise(() => undefined));
    render(<LyricsPanel />);
    const similarityButton = screen.getByRole('button', {name: 'Check Similarity'});

    fireEvent.click(similarityButton);

    expect(similarityButton).toBeDisabled();
    expect(similarityButton.querySelector('.lyrics-similarity-spinner')).not.toBeNull();
  });

  it('labels the focused section start and end timestamps', () => {
    render(<LyricsPanel />);

    fireEvent.focus(screen.getByLabelText('[Section 1] name'));

    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
    expect(screen.getByLabelText('[Section 1] section start time')).toBeInTheDocument();
    expect(screen.getByLabelText('[Section 1] section end time')).toBeInTheDocument();
  });

  it('focuses the first lyric line when the section surface is pressed', async () => {
    const {container} = render(<LyricsPanel />);
    const section = container.querySelector('.lyrics-editor-section');
    expect(section).not.toBeNull();

    fireEvent.pointerDown(section!);

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('[Section 1] lyric line'));
    });
  });

  it('makes the current lyric readable during playback without focusing the editor', () => {
    const lyrics = defaultLyricDocument();
    lyrics.sections[0] = {
      ...lyrics.sections[0]!,
      endBeat: 8,
      lines: [
        {id: 'line-a', text: 'first bright line', startBeat: 0, timingSource: 'estimated'},
        {id: 'line-b', text: 'second lyric line', startBeat: 4, timingSource: 'estimated'},
      ],
    };
    useDAWStore.setState({isPlaying: true, playheadBeat: 2.1, lyrics});
    const {container} = render(<LyricsPanel />);

    const active = container.querySelector('.lyrics-line-row.is-active');
    expect(active?.querySelector('.lyrics-line-playback')).not.toBeNull();
    expect([...active!.querySelectorAll('.lyrics-word.is-lit')].map(word => word.textContent))
      .toEqual(['first', 'bright']);
    expect(container.querySelectorAll('.lyrics-line-row.is-active')).toHaveLength(1);
  });

  it('toggles the lyrics right dock from the notebook nav button', () => {
    const onToggleRightPanel = jest.fn();

    render(
      <WorkspaceNavButtons
        rightPanel={null}
        isMixerOpen={false}
        onToggleRightPanel={onToggleRightPanel}
        onToggleMixer={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Lyrics'}));
    expect(onToggleRightPanel).toHaveBeenCalledWith('lyrics');
  });
});
