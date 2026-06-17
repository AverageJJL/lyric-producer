import {useEffect, useState} from 'react';

import {useDAWStore} from '../store/useDAWStore';

/** Re-render timeline while held MIDI keys are active so note lengths can grow. */
export function useLivePreviewTicker(): void {
  const hasHeldNotes = useDAWStore(state =>
    Object.values(state.liveMidiPreviewByTrack).some(
      preview => Object.keys(preview.active).length > 0,
    ),
  );
  const [, bump] = useState(0);

  useEffect(() => {
    if (!hasHeldNotes) {
      return;
    }

    let frame = 0;
    const tick = () => {
      bump(n => n + 1);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [hasHeldNotes]);
}
