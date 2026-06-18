import {
  captureProjectSnapshot,
  emptyProjectSnapshot,
  snapshotFingerprint,
} from '../src/arrangement/projectSnapshot';
import {restoreProjectSnapshot} from '../src/arrangement/projectRestore';
import {
  compileApcSourceToSnapshot,
  decomposeSnapshotToApcSource,
  parseApcSourceFiles,
  serializeApcSource,
} from '../src/arrangement/apc';
import {
  type CopilotChatProjectState,
  resetCopilotChatHistoryForTests,
  useCopilotChatHistoryStore,
} from '../src/assistant/copilotChatHistory';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

const SAVED_AT = '2026-01-01T00:00:00.000Z';

function seedCopilotChat(): string {
  const chat = useCopilotChatHistoryStore.getState();
  const sessionId = chat.activeSessionId;
  chat.appendMessage(sessionId, {
    id: 'msg-user',
    role: 'user',
    content: 'How should I arrange the chorus?',
  });
  chat.appendMessage(sessionId, {
    id: 'msg-assistant',
    role: 'assistant',
    content: 'Double the hook with a brighter synth.',
    model: 'mimo',
  });
  chat.setSessionMemory(sessionId, 'The chorus needs a brighter lift.', 2);
  return sessionId;
}

describe('Copilot chat project persistence', () => {
  beforeEach(() => {
    restoreProjectSnapshot(emptyProjectSnapshot(), {skipNativeRefresh: true});
    resetCopilotChatHistoryForTests();
    window.audioEngine = undefined;
  });

  it('survives project snapshot capture and restore', () => {
    const sessionId = seedCopilotChat();
    const snapshot = captureProjectSnapshot();

    resetCopilotChatHistoryForTests();
    const restored = restoreProjectSnapshot(snapshot, {skipNativeRefresh: true});
    const restoredSession = restored.copilotChats.sessions[0];
    const liveSession = useCopilotChatHistoryStore.getState().sessions
      .find(session => session.id === sessionId);

    expect(restoredSession?.messages.map(message => message.content)).toEqual([
      'How should I arrange the chorus?',
      'Double the hook with a brighter synth.',
    ]);
    expect(liveSession?.conversationSummary).toBe('The chorus needs a brighter lift.');
  });

  it('round-trips through copilot.json in the .apc source tree', () => {
    seedCopilotChat();
    const snapshot = captureProjectSnapshot();
    const fingerprint = snapshotFingerprint(snapshot);
    const files = serializeApcSource(decomposeSnapshotToApcSource(snapshot, SAVED_AT));

    expect(files.find(file => file.relativePath === 'copilot.json')).toBeDefined();
    const parsed = parseApcSourceFiles(files);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const result = compileApcSourceToSnapshot(parsed.source);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(snapshotFingerprint(result.snapshot)).toBe(fingerprint);
        expect(result.snapshot.copilotChats.sessions[0]?.messages).toHaveLength(2);
      }
    }
  });

  it('opens older .apc source trees without copilot.json as empty chat history', () => {
    seedCopilotChat();
    const files = serializeApcSource(
      decomposeSnapshotToApcSource(captureProjectSnapshot(), SAVED_AT),
    ).filter(file => file.relativePath !== 'copilot.json');

    const parsed = parseApcSourceFiles(files);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const result = compileApcSourceToSnapshot(parsed.source);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.snapshot.copilotChats.sessions).toEqual([]);
        expect(result.snapshot.copilotChats.activeSessionId).toBeNull();
      }
    }
  });

  it('sanitizes persisted option cards when hydrating chat history', () => {
    const malformed = {
      version: 1,
      activeSessionId: 'session-1',
      sessions: [{
        id: 'session-1',
        title: 'Malformed options',
        createdAt: SAVED_AT,
        updatedAt: SAVED_AT,
        compactedMessageCount: 0,
        messages: [{
          id: 'msg-assistant',
          role: 'assistant',
          content: 'Here are some options.',
          midiOptions: [{id: 'bad-midi', label: 'Missing notes'}],
          drumPatternOptions: [{id: 'bad-drums', label: 'Missing lanes'}],
        }],
      }],
    } as unknown as CopilotChatProjectState;

    useCopilotChatHistoryStore.getState().restoreProjectState(malformed);

    const restored = useCopilotChatHistoryStore.getState().sessions[0]?.messages[0];
    expect(restored?.midiOptions).toBeUndefined();
    expect(restored?.drumPatternOptions).toBeUndefined();
  });
});
