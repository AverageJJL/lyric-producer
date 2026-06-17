import {useEffect} from 'react';

type TransportShortcutHandlers = {
  onTogglePlay: () => void;
  onReturnToZero: () => void;
  onToggleRecord?: () => void;
  onToggleEditor?: () => void;
};

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

export function isTransportPlayPauseShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'code' | 'key' | 'metaKey' | 'shiftKey'> &
    Partial<Pick<KeyboardEvent, 'repeat'>>,
): boolean {
  return (
    !event.repeat &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.code === 'Space' || event.key === ' ')
  );
}

export function isTransportReturnToZeroShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'> &
    Partial<Pick<KeyboardEvent, 'repeat'>>,
): boolean {
  return (
    !event.repeat &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.key === 'Enter'
  );
}

export function isTransportRecordShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'> &
    Partial<Pick<KeyboardEvent, 'repeat'>>,
): boolean {
  return (
    !event.repeat &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'r'
  );
}

export function isEditorToggleShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'> &
    Partial<Pick<KeyboardEvent, 'repeat'>>,
): boolean {
  return (
    !event.repeat &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'e'
  );
}

export function useTransportShortcuts({
  onTogglePlay,
  onReturnToZero,
  onToggleRecord,
  onToggleEditor,
}: TransportShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (isTransportPlayPauseShortcut(event)) {
        event.preventDefault();
        onTogglePlay();
        return;
      }

      if (isTransportReturnToZeroShortcut(event)) {
        event.preventDefault();
        onReturnToZero();
        return;
      }

      if (onToggleRecord && isTransportRecordShortcut(event)) {
        event.preventDefault();
        onToggleRecord();
        return;
      }

      if (onToggleEditor && isEditorToggleShortcut(event)) {
        event.preventDefault();
        onToggleEditor();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onReturnToZero, onToggleEditor, onTogglePlay, onToggleRecord]);
}
