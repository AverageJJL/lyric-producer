import {fireEvent, screen} from '@testing-library/react';

/** Opens the right-side Browser dock (media bin, consolidation, etc.). */
export function openBrowserDock(): void {
  fireEvent.click(screen.getByRole('button', {name: 'Browser'}));
}

/** Opens the right-side Audio device dock. */
export function openAudioDock(): void {
  fireEvent.click(screen.getByRole('button', {name: 'Audio settings'}));
}

/** Opens the right-side Samples dock. */
export function openSamplesDock(): void {
  fireEvent.click(screen.getByRole('button', {name: 'Samples'}));
}
