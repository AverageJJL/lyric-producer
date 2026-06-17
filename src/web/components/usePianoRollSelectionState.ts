import {useEffect, useState} from 'react';

export type PianoRollSelectionMode = 'replace' | 'toggle';

export function usePianoRollSelectionState(blockId: string | null | undefined, noteCount: number) {
  const [activeNoteIndex, setActiveNoteIndex] = useState<number | null>(0);
  const [selectedNoteIndexes, setSelectedNoteIndexes] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    setActiveNoteIndex(noteCount > 0 ? 0 : null);
    setSelectedNoteIndexes(noteCount > 0 ? new Set([0]) : new Set());
  }, [blockId]);

  useEffect(() => {
    setSelectedNoteIndexes(prev => new Set([...prev].filter(index => index < noteCount)));
    setActiveNoteIndex(index => {
      if (noteCount === 0) {
        return null;
      }
      return index === null ? null : Math.min(index, noteCount - 1);
    });
  }, [noteCount]);

  const selectedIndexesArray = () =>
    selectedNoteIndexes.size > 0 ? [...selectedNoteIndexes] : activeNoteIndex === null ? [] : [activeNoteIndex];

  const selectNote = (index: number, mode: PianoRollSelectionMode) => {
    const next = mode === 'toggle'
      ? new Set(selectedNoteIndexes.has(index)
        ? [...selectedNoteIndexes].filter(item => item !== index)
        : [...selectedNoteIndexes, index])
      : new Set([index]);
    setSelectedNoteIndexes(next);
    setActiveNoteIndex(next.has(index) ? index : [...next][0] ?? null);
  };

  const selectIndexes = (indexes: number[], additive: boolean) => {
    const next = additive ? new Set([...selectedNoteIndexes, ...indexes]) : new Set(indexes);
    setSelectedNoteIndexes(next);
    setActiveNoteIndex([...next].sort((a, b) => a - b)[0] ?? null);
  };

  const clearSelection = () => {
    setSelectedNoteIndexes(new Set());
    setActiveNoteIndex(null);
  };

  const selectOnly = (indexes: number[]) => {
    setSelectedNoteIndexes(new Set(indexes));
    setActiveNoteIndex(indexes[0] ?? null);
  };

  return {
    activeNoteIndex,
    selectedNoteIndexes,
    selectedIndexesArray,
    selectNote,
    selectIndexes,
    clearSelection,
    selectOnly,
  };
}
