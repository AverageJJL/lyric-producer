import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import {AddTrackMenu} from '../src/web/components/AddTrackMenu';

function renderAddTrackMenu() {
  render(
    <AddTrackMenu
      onAddVirtualInstrument={jest.fn()}
      onAddDrumMachine={jest.fn()}
      onAddVoiceAudio={jest.fn()}
    />,
  );
}

describe('AddTrackMenu', () => {
  it('closes on the first outside pointer press after opening', () => {
    renderAddTrackMenu();

    fireEvent.click(screen.getByRole('button', {name: '+ Add track'}));
    expect(screen.getByRole('button', {name: 'Voice / Audio'})).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('button', {name: 'Voice / Audio'})).not.toBeInTheDocument();
  });
});
