import React from 'react';
import {cleanup, render} from '@testing-library/react';

import {
  confirmDirtyProjectDiscard,
  DIRTY_PROJECT_DISCARD_PROMPT,
  useDirtyProjectUnloadPrompt,
} from '../src/hooks/useDirtyProjectUnloadPrompt';

function PromptHarness({isDirty}: {isDirty: boolean}) {
  useDirtyProjectUnloadPrompt(isDirty);
  return null;
}

function dispatchBeforeUnload(): Event {
  const event = new Event('beforeunload', {cancelable: true});
  window.dispatchEvent(event);
  return event;
}

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

test('allows clean project unloads without prompting', () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<PromptHarness isDirty={false} />);

  const event = dispatchBeforeUnload();

  expect(confirmSpy).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
});

test('defers dirty project unloads to the native unload prompt', () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<PromptHarness isDirty />);

  const event = dispatchBeforeUnload();

  expect(confirmSpy).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(true);
});

test('skips beforeunload when the Electron lifecycle bridge is present', () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
  const setProjectDirty = jest.fn();
  Object.defineProperty(window, 'appLifecycle', {
    configurable: true,
    value: {setProjectDirty},
  });

  render(<PromptHarness isDirty />);

  const event = dispatchBeforeUnload();

  expect(setProjectDirty).toHaveBeenCalledWith(true);
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);

  delete (window as Window & {appLifecycle?: unknown}).appLifecycle;
});

test('uses confirm for explicit project discard actions', () => {
  jest.spyOn(window, 'confirm').mockReturnValue(false);

  expect(confirmDirtyProjectDiscard(true)).toBe(false);
  expect(confirmDirtyProjectDiscard(false)).toBe(true);
});
