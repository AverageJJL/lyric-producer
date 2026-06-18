const mockHandle = jest.fn();

jest.mock('electron', () => ({
  ipcMain: {handle: (...args: unknown[]) => mockHandle(...args)},
}));

import {registerCopilotIpc} from '../electron/copilotIpc';

describe('copilot IPC registration', () => {
  it('registers the single agent-ask handler and compact, but not the removed classic ask', () => {
    mockHandle.mockClear();
    registerCopilotIpc();

    expect(mockHandle).toHaveBeenCalledWith('copilot:agent-ask', expect.any(Function));
    expect(mockHandle).toHaveBeenCalledWith('copilot:compact', expect.any(Function));
    // The classic single-shot path was removed — there is only one Copilot request path now.
    expect(mockHandle).not.toHaveBeenCalledWith('copilot:ask', expect.any(Function));
  });
});
