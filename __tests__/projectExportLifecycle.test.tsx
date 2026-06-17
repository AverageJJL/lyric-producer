import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';

import {useProjectExportLifecycle} from '../src/hooks/useProjectExportLifecycle';

const sendCommand = jest.fn();
const exportMixdown = jest.fn();

function Harness() {
  const [isBusy, setIsBusy] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState('Idle');
  const exports = useProjectExportLifecycle({
    setIsBusy,
    setErrorMessage,
    setStatusMessage,
  });

  return (
    <div>
      <button type="button" onClick={exports.exportMixdown} disabled={isBusy}>Export</button>
      {exports.canCancelExport ? (
        <button type="button" onClick={exports.cancelExport}>Cancel</button>
      ) : null}
      <span title="status">{errorMessage ?? statusMessage}</span>
    </div>
  );
}

beforeEach(() => {
  window.audioEngine = {sendCommand};
  window.projectFiles = {
    saveProject: jest.fn(),
    openProject: jest.fn(),
    exportMixdown,
  };
  sendCommand.mockReturnValue(JSON.stringify({ok: true, data: {path: '/tmp/mix.wav'}}));
});

afterEach(() => {
  sendCommand.mockReset();
  exportMixdown.mockReset();
  delete window.audioEngine;
  delete window.projectFiles;
});

test('canceling a pending export prevents the native render command', async () => {
  let resolveExport!: (value: {ok: true; path: string}) => void;
  exportMixdown.mockReturnValue(new Promise(resolve => {
    resolveExport = resolve;
  }));
  render(<Harness />);

  await act(async () => {
    fireEvent.click(screen.getByRole('button', {name: 'Export'}));
    await Promise.resolve();
  });
  expect(screen.getByRole('button', {name: 'Cancel'})).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
  await act(async () => {
    resolveExport({ok: true, path: '/tmp/mix.wav'});
    await Promise.resolve();
  });

  expect(sendCommand.mock.calls.filter(([command]) => command === 'render_mixdown_async'))
    .toHaveLength(0);
  expect(screen.getByTitle('status')).toHaveTextContent('Export canceled.');
});
