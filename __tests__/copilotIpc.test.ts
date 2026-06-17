const mockHandle = jest.fn();

jest.mock('electron', () => ({
  ipcMain: {handle: (...args: unknown[]) => mockHandle(...args)},
}));

import {askOpenRouterCopilot, registerCopilotIpc} from '../electron/copilotIpc';

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => body,
  } as Response;
}

function debugRequest() {
  return {
    message: 'How do I add a track?',
    history: [],
    uiState: {rightPanel: 'copilot'},
    context: {
      project: {
        rightPanel: 'copilot',
        isMixerOpen: false,
        trackCount: 0,
        hasSelectedBlock: false,
        bpm: 120,
        isPlaying: false,
        isRecording: false,
        selectedTrackName: 'Private track name',
      },
      visibleTargets: [{id: 'add-track-button', label: '+ Add track'}],
      workflows: [{entrypointTargetId: 'track-details'}],
    },
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('copilot OpenRouter IPC helper', () => {
  it('builds a bounded OpenRouter tool-call request', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      choices: [{
        message: {
          tool_calls: [{
            function: {
              name: 'answer_copilot',
              arguments: JSON.stringify({
                text: 'Use + Add track.',
                actions: [{type: 'show_ui_guide', targetId: 'add-track-button'}],
              }),
            },
          }],
        },
      }],
    }));

    await expect(askOpenRouterCopilot({
      message: 'How do I add a track?',
      history: [],
      uiState: {rightPanel: null},
      context: {
        visibleTargets: [{id: 'add-track-button', label: '+ Add track'}],
        workflows: [],
      },
    }, {
      env: {OPENROUTER_API_KEY: 'sk-test', AI_PRODUCER_REASONING_EFFORT: 'low'},
      fetchImpl,
    })).resolves.toEqual({
      ok: true,
      model: 'xiaomi/mimo-v2.5',
      answer: {
        text: 'Use + Add track.',
        actions: [{type: 'show_ui_guide', targetId: 'add-track-button'}],
        midiBlockEdits: [],
        midiOptions: [],
        drumPatternOptions: [],
        drumPatternEdits: [],
      },
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('xiaomi/mimo-v2.5');
    expect(body.stream).toBe(false);
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(4096);
    expect(body.reasoning).toEqual({effort: 'low', exclude: true});
    expect(body.messages[0].content).toContain('Examples of answer_copilot arguments');
    expect(body.messages[0].content).toContain('Never claim edits were applied');
    expect(body.messages[0].content).toContain('Do not create tracks directly');
    expect(body.messages[0].content).toContain('Use copilotContext.musical for BPM, time signature, scale, chord');
    expect(body.messages[0].content).toContain('Use copilotContext.catalog for available virtual instruments');
    expect(body.messages[0].content).toContain('You cannot hear raw audio in Copilot chat');
    expect(body.messages[0].content).toContain('prefer 2-3 midiOptions');
    expect(body.messages[0].content).toContain('prefer 2-3 drumPatternOptions');
    expect(body.messages[1].content).toContain('copilotContext');
    expect(body.messages[1].content).toContain('reveal_ui_target');
    expect(body.messages[1].content).toContain('allowedMidiBlockEdits');
    expect(body.tools[0].function.name).toBe('answer_copilot');
    expect(body.tools[0].function.parameters.properties.actions.items.properties.type.enum)
      .toContain('reveal_ui_target');
    expect(body.tools[0].function.parameters.properties.midiBlockEdits.items.properties.op.enum)
      .toContain('upsertMidiBlock');
    expect(body.tools[0].function.parameters.properties.midiOptions.items.properties.role.enum)
      .toContain('bassline');
    expect(body.tools[0].function.parameters.properties.drumPatternOptions.items.properties.lanes.properties)
      .toHaveProperty('kick');
    expect(body.tool_choice).toBeUndefined();
  });

  it('logs a safe debug summary for dev-server Copilot requests', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchImpl = jest.fn().mockResolvedValue(response({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          tool_calls: [{
            function: {
              name: 'answer_copilot',
              arguments: JSON.stringify({
                text: 'Use + Add track.',
                actions: [{type: 'show_ui_guide', targetId: 'add-track-button'}],
              }),
            },
          }],
        },
      }],
    }));

    await askOpenRouterCopilot(debugRequest(), {
      env: {
        OPENROUTER_API_KEY: 'sk-test',
        ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173/',
      },
      fetchImpl,
    });

    expect(info).toHaveBeenCalledWith('[copilot-debug]', expect.objectContaining({
      model: 'xiaomi/mimo-v2.5',
      httpStatus: 200,
      parseResult: 'valid_answer_copilot',
      finishReason: 'tool_calls',
      actionCount: 1,
      actionTypes: ['show_ui_guide'],
      actionTargetIds: ['add-track-button'],
    }));
    const summary = info.mock.calls[0][1] as Record<string, unknown>;
    expect(summary.context).toEqual(expect.objectContaining({
      visibleTargetCount: 1,
      workflowCount: 1,
      targetIds: ['add-track-button'],
      workflowEntryIds: ['track-details'],
      likelyTargetPresence: expect.objectContaining({'add-track-button': true}),
      project: expect.objectContaining({trackCount: 0, bpm: 120, hasSelectedTrack: true}),
    }));
    expect(JSON.stringify(summary)).not.toContain('Private track name');
    expect(JSON.stringify(summary)).not.toContain('How do I add');
  });

  it('logs missing answer_copilot tool calls before JSON fallback recovery', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await expect(askOpenRouterCopilot(debugRequest(), {
      env: {OPENROUTER_API_KEY: 'sk-test', AI_PRODUCER_COPILOT_DEBUG: '1'},
      fetchImpl: jest.fn().mockResolvedValue(response({
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({text: 'Plain JSON answer.', actions: []}),
          },
        }],
      })),
    })).resolves.toEqual({
      ok: true,
      model: 'xiaomi/mimo-v2.5',
      answer: {text: 'Plain JSON answer.', actions: [], midiBlockEdits: [], midiOptions: [], drumPatternOptions: [], drumPatternEdits: []},
    });

    expect(info).toHaveBeenCalledWith('[copilot-debug]', expect.objectContaining({
      parseResult: 'missing_answer_copilot',
      response: expect.objectContaining({
        hasChoices: true,
        hasMessageContent: true,
        toolCallCount: 0,
        toolCallNames: [],
      }),
      rawModelOutput: expect.objectContaining({
        messageContent: expect.stringContaining('Plain JSON answer.'),
      }),
    }));
    expect(info).toHaveBeenCalledWith('[copilot-debug]', expect.objectContaining({
      parseResult: 'valid_json_fallback',
    }));
  });

  it('accepts provider tool arguments that are already objects', async () => {
    await expect(askOpenRouterCopilot(debugRequest(), {
      env: {OPENROUTER_API_KEY: 'sk-test'},
      fetchImpl: jest.fn().mockResolvedValue(response({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'answer_copilot',
                arguments: {
                  text: 'Open the volume control.',
                  actions: [{type: 'reveal_ui_target', targetId: 'track:track-1:volume'}],
                },
              },
            }],
          },
        }],
      })),
    })).resolves.toEqual({
      ok: true,
      model: 'xiaomi/mimo-v2.5',
      answer: {
        text: 'Open the volume control.',
        actions: [{type: 'reveal_ui_target', targetId: 'track:track-1:volume'}],
        midiBlockEdits: [],
        midiOptions: [],
        drumPatternOptions: [],
        drumPatternEdits: [],
      },
    });
  });

  it('logs a raw preview for malformed tool arguments', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await expect(askOpenRouterCopilot(debugRequest(), {
      env: {OPENROUTER_API_KEY: 'sk-test', AI_PRODUCER_COPILOT_DEBUG: '1'},
      fetchImpl: jest.fn().mockResolvedValue(response({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'answer_copilot',
                arguments: 'not-json-secret',
              },
            }],
          },
        }],
      })),
    })).resolves.toEqual({
      ok: false,
      error: 'OpenRouter returned an unreadable Copilot response after retry.',
    });

    expect(info).toHaveBeenCalledWith('[copilot-debug]', expect.objectContaining({
      parseResult: 'invalid_json_arguments',
      response: expect.objectContaining({
        toolCallCount: 1,
        toolCallNames: ['answer_copilot'],
      }),
      rawModelOutput: expect.objectContaining({
        answerCopilotArguments: 'not-json-secret',
        truncated: false,
      }),
    }));
    expect(JSON.stringify(info.mock.calls)).toContain('not-json-secret');
  });

  it('does not log Copilot debug summaries when debug is disabled', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await askOpenRouterCopilot(debugRequest(), {
      env: {OPENROUTER_API_KEY: 'sk-test'},
      fetchImpl: jest.fn().mockResolvedValue(response({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'answer_copilot',
                arguments: JSON.stringify({text: 'Done.', actions: []}),
              },
            }],
          },
        }],
      })),
    });

    expect(info).not.toHaveBeenCalled();
  });

  it('returns explicit errors for missing keys and bad responses', async () => {
    await expect(askOpenRouterCopilot({message: 'Hi'}))
      .resolves.toEqual({ok: false, error: 'Missing OPENROUTER_API_KEY for Copilot.'});

    await expect(askOpenRouterCopilot({message: 'Hi'}, {
      env: {OPENROUTER_API_KEY: 'sk-test'},
      fetchImpl: jest.fn().mockResolvedValue(response({error: {message: 'Nope'}}, false, 401)),
    })).resolves.toEqual({
      ok: false,
      error: 'OpenRouter request failed (401): Nope',
    });
  });

  it('registers the Electron handler', () => {
    mockHandle.mockClear();
    registerCopilotIpc();
    expect(mockHandle).toHaveBeenCalledWith('copilot:ask', expect.any(Function));
  });
});
