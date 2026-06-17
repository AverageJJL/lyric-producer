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

function toolResponse(argumentsValue: unknown) {
  return response({
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        tool_calls: [{
          function: {name: 'answer_copilot', arguments: argumentsValue},
        }],
      },
    }],
  });
}

const request = {
  message: 'Make a piano MIDI block',
  history: [],
  uiState: {rightPanel: 'copilot'},
  context: {
    project: {trackCount: 1, bpm: 120},
    arrangement: {
      selectedTrackId: 'track-1',
      softwareInstrumentTracks: [{id: 'track-1', name: 'Grand Piano'}],
      midiBlocks: [],
    },
    visibleTargets: [],
    workflows: [],
  },
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('copilot IPC repair loop', () => {
  it('retries malformed answer_copilot arguments once and accepts the repaired tool call', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(toolResponse('not-json-secret'))
      .mockResolvedValueOnce(toolResponse(JSON.stringify({
        text: 'Prepared a MIDI block for review.',
        actions: [],
        midiBlockEdits: [{
          op: 'upsertMidiBlock',
          id: 'clip-ai',
          trackId: 'track-1',
          name: 'Piano Idea',
          startBeat: 0,
          lengthBeats: 4,
          notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
        }],
      })));

    await expect(askOpenRouterCopilot(request, {
      env: {OPENROUTER_API_KEY: 'sk-test', AI_PRODUCER_COPILOT_DEBUG: '1'},
      fetchImpl,
    })).resolves.toMatchObject({
      ok: true,
      answer: {
        text: 'Prepared a MIDI block for review.',
        midiBlockEdits: [{op: 'upsertMidiBlock', id: 'clip-ai'}],
      },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(retryBody.messages[2].content).toContain('invalid_json_arguments');
    expect(retryBody.messages[2].content).not.toContain('not-json-secret');
    expect(info).toHaveBeenNthCalledWith(1, '[copilot-debug]', expect.objectContaining({
      attempt: 1,
      repairAttempt: false,
      parseResult: 'invalid_json_arguments',
    }));
    expect(info).toHaveBeenNthCalledWith(2, '[copilot-debug]', expect.objectContaining({
      attempt: 2,
      repairAttempt: true,
      parseResult: 'valid_answer_copilot',
      midiBlockEditCount: 1,
    }));
  });

  it('retries when the model mentions Apply but omits MIDI block edits', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(toolResponse(JSON.stringify({
        text: 'I prepared a pending edit; click Apply to confirm.',
        actions: [],
      })))
      .mockResolvedValueOnce(toolResponse(JSON.stringify({
        text: 'Prepared a MIDI block for review.',
        actions: [],
        midiBlockEdits: [{
          op: 'upsertMidiBlock',
          id: 'clip-ai',
          trackId: 'track-1',
          name: 'Piano Idea',
          startBeat: 0,
          lengthBeats: 4,
          notes: [],
        }],
      })));

    await expect(askOpenRouterCopilot(request, {
      env: {OPENROUTER_API_KEY: 'sk-test'},
      fetchImpl,
    })).resolves.toMatchObject({
      ok: true,
      answer: {midiBlockEdits: [{op: 'upsertMidiBlock', id: 'clip-ai'}]},
    });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).messages[2].content)
      .toContain('missing_midi_block_edits');
  });

  it('retries malformed MIDI edit objects before the renderer can drop them', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(toolResponse(JSON.stringify({
        text: 'I prepared a pending edit; click Apply to confirm.',
        actions: [],
        midiBlockEdits: [{op: 'upsertMidiBlock', name: 'Missing IDs', notes: []}],
      })))
      .mockResolvedValueOnce(toolResponse(JSON.stringify({
        text: 'Prepared a MIDI block for review.',
        actions: [],
        midiBlockEdits: [{
          op: 'upsertMidiBlock',
          id: 'clip-ai',
          trackId: 'track-1',
          name: 'Piano Idea',
          startBeat: 0,
          lengthBeats: 4,
          notes: [],
        }],
      })));

    await expect(askOpenRouterCopilot(request, {
      env: {OPENROUTER_API_KEY: 'sk-test'},
      fetchImpl,
    })).resolves.toMatchObject({
      ok: true,
      answer: {midiBlockEdits: [{op: 'upsertMidiBlock', id: 'clip-ai'}]},
    });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).messages[2].content)
      .toContain('invalid_midi_block_edits');
  });

  it('falls back to no-tools JSON when provider returns empty tool-mode messages', async () => {
    const emptyToolModeResponse = response({
      choices: [{finish_reason: 'stop', message: {content: null}}],
    });
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(emptyToolModeResponse)
      .mockResolvedValueOnce(emptyToolModeResponse)
      .mockResolvedValueOnce(response({
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              text: 'Prepared a romantic MIDI block. Click Apply to add it.',
              actions: [],
              midiBlockEdits: [{
                op: 'upsertMidiBlock',
                trackId: 'track-1',
                name: 'Romantic Piano',
                startBeat: 0,
                lengthBeats: 4,
                notes: [{note: 60, velocity: 86, startBeat: 0, lengthBeats: 1}],
              }],
            }),
          },
        }],
      }));

    await expect(askOpenRouterCopilot(request, {
      env: {OPENROUTER_API_KEY: 'sk-test'},
      fetchImpl,
    })).resolves.toMatchObject({
      ok: true,
      answer: {midiBlockEdits: [{op: 'upsertMidiBlock', trackId: 'track-1'}]},
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const fallbackBody = JSON.parse(fetchImpl.mock.calls[2][1].body);
    expect(fallbackBody.tools).toBeUndefined();
    expect(fallbackBody.messages[0].content).toContain('No tools are available');
    expect(fallbackBody.messages[2].content).toContain('raw JSON object');
    expect(fallbackBody.messages[2].content).not.toContain('answer_copilot tool call');
  });
});
