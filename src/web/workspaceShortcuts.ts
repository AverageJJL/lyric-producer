import type React from 'react';

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="textbox"]',
].join(',');

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR));
}

export function shouldFocusWorkspaceFromPointer(event: React.PointerEvent<HTMLElement>): boolean {
  return !isInteractiveTarget(event.target);
}
