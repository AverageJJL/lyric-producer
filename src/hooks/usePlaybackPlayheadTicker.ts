import {useEffect} from 'react';

/**
 * Playhead position during playback comes from engine `positionBeat` transport events.
 * Store-level wall-clock extrapolation ran ahead of heard MIDI (~1/2 bar) and stays disabled.
 * Visual-only smoothing is scoped to the playhead component so it cannot affect audio state.
 */
export function usePlaybackPlayheadTicker(): void {
  useEffect(() => {
    return undefined;
  }, []);
}
