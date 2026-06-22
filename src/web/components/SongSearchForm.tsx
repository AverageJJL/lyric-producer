import React from 'react';

import type {SongSeedTrack} from '../../native/songSeedApi';

type SearchState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

type SongSearchFormProps = {
  songInput: string;
  results: SongSeedTrack[];
  highlightedIndex: number;
  isDropdownOpen: boolean;
  searchState: SearchState;
  searchError: string | null;
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onInputFocus: () => void;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelectTrack: (track: SongSeedTrack) => void;
};

function coverInitial(track: SongSeedTrack): string {
  return track.title.trim().charAt(0).toUpperCase() || 'A';
}

const CACHED_CYANITE_SONGS = [
  'Blank Space - Taylor Swift',
  'Baby - Justin Bieber feat. Ludacris',
];

export function SongSearchForm({
  songInput,
  results,
  highlightedIndex,
  isDropdownOpen,
  searchState,
  searchError,
  onInputChange,
  onInputFocus,
  onInputKeyDown,
  onSelectTrack,
}: SongSearchFormProps) {
  return (
    <div className="song-idea-form" role="search">
      <label htmlFor="song-idea-input">Search for a song</label>
      <p className="song-search-demo-note">
        Live Musixmatch search is enabled. Cyanite is disabled for uncached songs in this demo to protect API usage.
      </p>
      <p className="song-search-demo-cache">
        Cached Cyanite pre-runs: {CACHED_CYANITE_SONGS.join('; ')}.
      </p>
      <div className="song-search-field">
        <input
          id="song-idea-input"
          value={songInput}
          onChange={onInputChange}
          onFocus={onInputFocus}
          onKeyDown={onInputKeyDown}
          placeholder="Song title or artist"
          aria-expanded={isDropdownOpen}
          aria-controls="song-search-results"
        />
        {isDropdownOpen && searchState !== 'idle' ? (
          <div id="song-search-results" className="song-search-dropdown" role="listbox">
            {searchState === 'loading' ? <p>Searching songs</p> : null}
            {searchState === 'empty' ? <p>No matching songs found</p> : null}
            {searchState === 'error' ? <p>{searchError}</p> : null}
            {searchState === 'ready' ? results.map((track, index) => (
              <button
                key={track.id}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={index === highlightedIndex ? 'active' : ''}
                onMouseDown={event => event.preventDefault()}
                onClick={() => onSelectTrack(track)}>
                {track.albumCoverUrl ? (
                  <img
                    className="song-search-cover"
                    src={track.albumCoverUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="song-search-cover fallback" aria-hidden="true">{coverInitial(track)}</span>
                )}
                <span className="song-search-copy">
                  <span>{track.title}</span>
                  <small>{[track.artist, track.album, track.releaseYear].filter(Boolean).join(' / ')}</small>
                </span>
              </button>
            )) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
