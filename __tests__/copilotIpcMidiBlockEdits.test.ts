const mockHandle = jest.fn();

jest.mock('electron', () => ({
  ipcMain: {handle: (...args: unknown[]) => mockHandle(...args)},
}));

import {askOpenRouterCopilot} from '../electron/copilotIpc';

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as Response;
}

function request() {
  return {
    message: 'Replace the selected MIDI block',
    history: [],
    uiState: {rightPanel: 'copilot'},
    context: {
      project: {trackCount: 1, bpm: 120},
      arrangement: {
        selectedTrackId: 'track-1',
        selectedMidiBlockId: 'clip-ai',
        softwareInstrumentTracks: [{id: 'track-1', name: 'Keys'}],
        midiBlocks: [{id: 'clip-ai', trackId: 'track-1', name: 'Lead', noteCount: 0}],
      },
      visibleTargets: [],
      workflows: [],
    },
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('copilot IPC MIDI block edits', () => {
  it('parses MIDI block edits and logs only a safe edit summary', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await expect(askOpenRouterCopilot(request(), {
      env: {OPENROUTER_API_KEY: 'sk-test', AI_PRODUCER_COPILOT_DEBUG: '1'},
      fetchImpl: jest.fn().mockResolvedValue(response({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'answer_copilot',
                arguments: JSON.stringify({
                  text: 'Prepared.',
                  actions: [],
                  midiBlockEdits: [{
                    op: 'upsertMidiBlock',
                    id: 'clip-ai',
                    trackId: 'track-1',
                    name: 'Lead',
                    startBeat: 0,
                    lengthBeats: 4,
                    notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
                  }],
                }),
              },
            }],
          },
        }],
      })),
    })).resolves.toEqual({
      ok: true,
      model: 'xiaomi/mimo-v2.5',
      answer: {
        text: 'Prepared.',
        actions: [],
        midiBlockEdits: [{
          op: 'upsertMidiBlock',
          id: 'clip-ai',
          trackId: 'track-1',
          name: 'Lead',
          startBeat: 0,
          lengthBeats: 4,
          notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
        }],
        midiOptions: [],
        drumPatternOptions: [],
        drumPatternEdits: [],
      },
    });

    expect(info).toHaveBeenCalledWith('[copilot-debug]', expect.objectContaining({
      midiBlockEditCount: 1,
      midiBlockEditOps: ['upsertMidiBlock'],
      midiBlockEditNoteCounts: [1],
    }));
    expect(JSON.stringify(info.mock.calls)).not.toContain('"note":60');
  });

  it('accepts create MIDI block edits without a model-supplied id', async () => {
    await expect(askOpenRouterCopilot(request(), {
      env: {OPENROUTER_API_KEY: 'sk-test'},
      fetchImpl: jest.fn().mockResolvedValue(response({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'answer_copilot',
                arguments: JSON.stringify({
                  text: 'Prepared.',
                  actions: [],
                  midiBlockEdits: [{
                    op: 'upsertMidiBlock',
                    trackId: 'track-1',
                    name: 'Piano Arp',
                    startBeat: 0,
                    lengthBeats: 4,
                    notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
                  }],
                }),
              },
            }],
          },
        }],
      })),
    })).resolves.toMatchObject({
      ok: true,
      answer: {
        midiBlockEdits: [{
          op: 'upsertMidiBlock',
          trackId: 'track-1',
          name: 'Piano Arp',
        }],
      },
    });
  });

  it('rejects MIDI edits with extra fields or notes outside the block', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      choices: [{
        message: {
          tool_calls: [{
            function: {
              name: 'answer_copilot',
              arguments: JSON.stringify({
                text: 'Prepared.',
                actions: [],
                midiBlockEdits: [{
                  op: 'upsertMidiBlock',
                  trackId: 'track-1',
                  name: 'Bad',
                  startBeat: 0,
                  lengthBeats: 1,
                  mood: 'extra',
                  notes: [{note: 60, velocity: 96, startBeat: 0.75, lengthBeats: 1}],
                }],
              }),
            },
          }],
        },
      }],
    }));

    await expect(askOpenRouterCopilot(request(), {
      env: {OPENROUTER_API_KEY: 'sk-test'},
      fetchImpl,
    })).resolves.toEqual({
      ok: false,
      error: 'OpenRouter returned an unreadable Copilot response after retry.',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
