import {fireEvent, screen} from '@testing-library/react';

export function openProjectMenu(): void {
  fireEvent.click(screen.getByRole('button', {name: 'Project menu'}));
}
