import {useMemo} from 'react';

import type {CopilotProjectContextInput} from '../../assistant/copilotProjectContext';
import {useDAWStore} from '../../store/useDAWStore';

export function useCopilotProjectContext(): CopilotProjectContextInput {
  const bpm = useDAWStore(state => state.bpm);
  const isPlaying = useDAWStore(state => state.isPlaying);
  const isRecording = useDAWStore(state => state.isRecording);
  const playheadBeat = useDAWStore(state => state.playheadBeat);
  const timeSignature = useDAWStore(state => state.timeSignature);
  const scale = useDAWStore(state => state.scale);
  const chord = useDAWStore(state => state.chord);
  const snapGrid = useDAWStore(state => state.snapGrid);
  const isRelativeSnapEnabled = useDAWStore(state => state.isRelativeSnapEnabled);
  const isCycleEnabled = useDAWStore(state => state.isCycleEnabled);
  const cycleStartBeat = useDAWStore(state => state.cycleStartBeat);
  const cycleEndBeat = useDAWStore(state => state.cycleEndBeat);
  const performanceMode = useDAWStore(state => state.performanceMode);
  const looperLengthBars = useDAWStore(state => state.looperLengthBars);
  const sections = useDAWStore(state => state.sections);

  return useMemo(() => ({
    musical: {
      bpm,
      timeSignature,
      scale,
      chord,
      snapGrid,
      isRelativeSnapEnabled,
      playheadBeat,
    },
    transport: {
      isPlaying,
      isRecording,
      isCycleEnabled,
      cycleStartBeat,
      cycleEndBeat,
      performanceMode,
      looperLengthBars,
    },
    sections,
  }), [
    bpm,
    chord,
    cycleEndBeat,
    cycleStartBeat,
    isCycleEnabled,
    isPlaying,
    isRecording,
    isRelativeSnapEnabled,
    looperLengthBars,
    performanceMode,
    playheadBeat,
    scale,
    sections,
    snapGrid,
    timeSignature,
  ]);
}
