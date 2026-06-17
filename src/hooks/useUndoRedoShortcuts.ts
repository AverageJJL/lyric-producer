import {useEffect} from 'react';

import {
  copySelectedBlockToClipboard,
  cutSelectedBlockToClipboard,
  pasteClipboardToArrangement,
} from '../arrangement/clipClipboard';
import {
  consolidateSelectedMidiClips,
  duplicateSelectedClip,
  glueSelectedMidiClips,
  quantizeSelectedMidiClips,
  repeatSelectedClipsOnce,
  splitSelectedClipAtPlayhead,
  trimSelectedClipEndToPlayhead,
  trimSelectedClipStartToPlayhead,
  trimSelectedClipsToCycleRange,
} from '../arrangement/clipEditCommands';
import {useDAWStore} from '../store/useDAWStore';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}

function shortcutScopeElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  return document.activeElement instanceof Element ? document.activeElement : null;
}

function isEditorShortcutScope(target: EventTarget | null): boolean {
  return Boolean(shortcutScopeElement(target)?.closest('[data-shortcut-scope="editor"]'));
}

export function isUndoShortcut(
  event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'key' | 'shiftKey'>,
): boolean {
  const mod = event.metaKey || event.ctrlKey;
  return mod && !event.shiftKey && event.key.toLowerCase() === 'z';
}

/** Cmd/Ctrl+Y plus Cmd/Ctrl+Shift+Z (Logic-style macOS redo). */
export function isRedoShortcut(
  event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'key' | 'shiftKey'>,
): boolean {
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  return mod && ((key === 'y' && !event.shiftKey) || (key === 'z' && event.shiftKey));
}

export function isArrangementDeleteShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey'> &
    Partial<Pick<KeyboardEvent, 'repeat'>>,
): boolean {
  return (
    !event.repeat &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    ['backspace', 'delete'].includes(event.key.toLowerCase())
  );
}

/** Cmd/Ctrl+C, X, or V for arrangement clip clipboard (no Shift/Alt). */
export function arrangementClipboardAction(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): 'copy' | 'cut' | 'paste' | null {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod || event.shiftKey || event.altKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === 'c') {
    return 'copy';
  }
  if (key === 'x') {
    return 'cut';
  }
  if (key === 'v') {
    return 'paste';
  }
  return null;
}

export function isCopyShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'c';
}

export function isPasteShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'v';
}

export function isDuplicateShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'd';
}

export function isSplitShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'b';
}

export function isGlueShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'j';
}

export function isConsolidateShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): boolean {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'j';
}

export function isRepeatShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'r';
}

export function isTrimStartShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === '[';
}

export function isTrimEndShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === ']';
}

export function isTrimToSelectionShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): boolean {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 't';
}

function deleteHighlightedArrangementItem(): boolean {
  const state = useDAWStore.getState();
  const selectedBlockIds = state.selectedBlockIds.filter(blockId =>
    state.blocks.some(block => block.id === blockId),
  );

  if (selectedBlockIds.length > 0) {
    state.removeBlocks(selectedBlockIds);
    return true;
  }

  if (state.selectedBlockId && state.blocks.some(block => block.id === state.selectedBlockId)) {
    state.removeBlock(state.selectedBlockId);
    return true;
  }

  if (state.selectedTrackId && state.tracks.some(track => track.id === state.selectedTrackId)) {
    state.removeTrack(state.selectedTrackId);
    return true;
  }

  return false;
}

export function useUndoRedoShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }

      if (isUndoShortcut(event)) {
        if (!useDAWStore.getState().canUndo()) {
          return;
        }
        event.preventDefault();
        useDAWStore.getState().undo();
        return;
      }

      if (isRedoShortcut(event)) {
        if (!useDAWStore.getState().canRedo()) {
          return;
        }
        event.preventDefault();
        useDAWStore.getState().redo();
        return;
      }

      if (isEditorShortcutScope(event.target)) {
        return;
      }

      if (isDuplicateShortcut(event) && duplicateSelectedClip()) {
        event.preventDefault();
        return;
      }

      if (isSplitShortcut(event) && splitSelectedClipAtPlayhead()) {
        event.preventDefault();
        return;
      }

      if (isGlueShortcut(event) && glueSelectedMidiClips()) {
        event.preventDefault();
        return;
      }

      if (isConsolidateShortcut(event) && consolidateSelectedMidiClips()) {
        event.preventDefault();
        return;
      }

      if (isRepeatShortcut(event)) {
        event.preventDefault();
        repeatSelectedClipsOnce();
        return;
      }

      if (isTrimStartShortcut(event) && trimSelectedClipStartToPlayhead()) {
        event.preventDefault();
        return;
      }

      if (isTrimEndShortcut(event) && trimSelectedClipEndToPlayhead()) {
        event.preventDefault();
        return;
      }

      if (isTrimToSelectionShortcut(event) && trimSelectedClipsToCycleRange()) {
        event.preventDefault();
        return;
      }

      if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'q' && quantizeSelectedMidiClips()) {
        event.preventDefault();
        return;
      }

      if (isArrangementDeleteShortcut(event) && deleteHighlightedArrangementItem()) {
        event.preventDefault();
        return;
      }

      const clipboardAction = arrangementClipboardAction(event);
      if (clipboardAction === 'copy' && copySelectedBlockToClipboard()) {
        event.preventDefault();
        return;
      }
      if (clipboardAction === 'cut' && cutSelectedBlockToClipboard()) {
        event.preventDefault();
        return;
      }
      if (clipboardAction === 'paste' && pasteClipboardToArrangement()) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
