import {create} from 'zustand';

import {sanitizeAskReports, type AskReport} from './askReports';
import {
  sanitizeCopilotDrumPatternOptions,
  type CopilotDrumPatternOption,
} from './copilotDrumPatternOptions';
import {
  sanitizeCopilotMidiOptions,
  type CopilotMidiOption,
} from './copilotMidiOptions';

export type CopilotPersistedMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  error?: boolean;
  midiOptions?: CopilotMidiOption[];
  drumPatternOptions?: CopilotDrumPatternOption[];
  askReports?: AskReport[];
};

export type CopilotChatSession = {
  id: string;
  title: string;
  messages: CopilotPersistedMessage[];
  conversationSummary?: string;
  compactedMessageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CopilotChatProjectState = {
  version: 1;
  activeSessionId: string | null;
  sessions: CopilotChatSession[];
};

type CopilotChatHistoryState = {
  activeSessionId: string;
  pendingSessionId: string | null;
  sessions: CopilotChatSession[];
  appendMessage: (sessionId: string, message: CopilotPersistedMessage) => void;
  newChat: () => string;
  selectSession: (sessionId: string) => void;
  setRequestPending: (sessionId: string | null) => void;
  setSessionMemory: (sessionId: string, summary: string, compactedMessageCount: number) => void;
  restoreProjectState: (projectState?: CopilotChatProjectState | null) => void;
};

const UNTITLED_CHAT = 'New chat';
const TITLE_LIMIT = 46;

function nowIso(): string {
  return new Date().toISOString();
}

function generatedId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function blankSession(): CopilotChatSession {
  const timestamp = nowIso();
  return {
    id: generatedId('copilot-chat'),
    title: UNTITLED_CHAT,
    messages: [],
    compactedMessageCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function emptyCopilotChatProjectState(): CopilotChatProjectState {
  return {version: 1, activeSessionId: null, sessions: []};
}

function titleFromMessage(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return UNTITLED_CHAT;
  }
  return compact.length > TITLE_LIMIT ? `${compact.slice(0, TITLE_LIMIT - 1)}...` : compact;
}

function cleanString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function cleanCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function cleanMidiOptions(value: unknown): CopilotMidiOption[] | undefined {
  const options = sanitizeCopilotMidiOptions(value);
  return options.length > 0 ? options : undefined;
}

function cleanDrumPatternOptions(value: unknown): CopilotDrumPatternOption[] | undefined {
  const options = sanitizeCopilotDrumPatternOptions(value);
  return options.length > 0 ? options : undefined;
}

function cleanAskReports(value: unknown): AskReport[] | undefined {
  const reports = sanitizeAskReports(value);
  return reports.length > 0 ? reports : undefined;
}

function cloneMessage(value: unknown): CopilotPersistedMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const message = value as CopilotPersistedMessage;
  if ((message.role !== 'user' && message.role !== 'assistant') || !cleanString(message.content)) {
    return null;
  }
  return {
    id: cleanString(message.id, generatedId('copilot-message')),
    role: message.role,
    content: cleanString(message.content),
    model: cleanString(message.model) || undefined,
    error: message.error === true,
    midiOptions: cleanMidiOptions(message.midiOptions),
    drumPatternOptions: cleanDrumPatternOptions(message.drumPatternOptions),
    askReports: cleanAskReports(message.askReports),
  };
}

function cloneSession(value: unknown): CopilotChatSession | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const session = value as CopilotChatSession;
  const messages = Array.isArray(session.messages)
    ? session.messages.map(cloneMessage).filter((item): item is CopilotPersistedMessage => item !== null)
    : [];
  if (messages.length === 0) {
    return null;
  }
  const createdAt = cleanString(session.createdAt, nowIso());
  const updatedAt = cleanString(session.updatedAt, createdAt);
  return {
    id: cleanString(session.id, generatedId('copilot-chat')),
    title: cleanString(session.title, titleFromMessage(messages[0]?.content ?? '')),
    messages,
    conversationSummary: cleanString(session.conversationSummary) || undefined,
    compactedMessageCount: cleanCount(session.compactedMessageCount),
    createdAt,
    updatedAt,
  };
}

export function normalizeCopilotChatProjectState(value: unknown): CopilotChatProjectState {
  if (!value || typeof value !== 'object') {
    return emptyCopilotChatProjectState();
  }
  const projectState = value as CopilotChatProjectState;
  const sessions = Array.isArray(projectState.sessions)
    ? projectState.sessions.map(cloneSession).filter((item): item is CopilotChatSession => item !== null)
    : [];
  const ids = new Set<string>();
  const uniqueSessions = sessions.filter(session => {
    if (ids.has(session.id)) {
      return false;
    }
    ids.add(session.id);
    return true;
  });
  const activeSessionId = typeof projectState.activeSessionId === 'string' &&
    uniqueSessions.some(session => session.id === projectState.activeSessionId)
    ? projectState.activeSessionId
    : null;
  return {version: 1, activeSessionId, sessions: uniqueSessions};
}

function persistedSessions(sessions: CopilotChatSession[]): CopilotChatSession[] {
  return sessions
    .filter(session => session.messages.length > 0)
    .map(session => cloneSession(session))
    .filter((session): session is CopilotChatSession => session !== null);
}

export const useCopilotChatHistoryStore = create<CopilotChatHistoryState>(set => {
  const initial = blankSession();
  return {
    activeSessionId: initial.id,
    pendingSessionId: null,
    sessions: [initial],
    appendMessage: (sessionId, message) => set(state => {
      const timestamp = nowIso();
      return {
        sessions: state.sessions.map(session => {
          if (session.id !== sessionId) {
            return session;
          }
          const messages = [...session.messages, message];
          const firstUser = messages.find(item => item.role === 'user');
          return {
            ...session,
            messages,
            title: session.title === UNTITLED_CHAT && firstUser
              ? titleFromMessage(firstUser.content)
              : session.title,
            updatedAt: timestamp,
          };
        }),
      };
    }),
    newChat: () => {
      const session = blankSession();
      set(state => {
        const active = state.sessions.find(item => item.id === state.activeSessionId);
        if (active && active.messages.length === 0) {
          return {activeSessionId: active.id};
        }
        return {activeSessionId: session.id, sessions: [session, ...state.sessions]};
      });
      return session.id;
    },
    selectSession: sessionId => set(state =>
      state.sessions.some(session => session.id === sessionId)
        ? {activeSessionId: sessionId}
        : {},
    ),
    setRequestPending: sessionId => set({pendingSessionId: sessionId}),
    setSessionMemory: (sessionId, summary, compactedMessageCount) => set(state => ({
      sessions: state.sessions.map(session => session.id === sessionId
        ? {...session, conversationSummary: summary, compactedMessageCount}
        : session),
    })),
    restoreProjectState: projectState => set(() => {
      const restored = normalizeCopilotChatProjectState(projectState);
      const needsBlankActive = restored.activeSessionId === null;
      const blank = needsBlankActive ? blankSession() : null;
      return {
        activeSessionId: restored.activeSessionId ?? blank!.id,
        pendingSessionId: null,
        sessions: blank ? [blank, ...restored.sessions] : restored.sessions,
      };
    }),
  };
});

export function captureCopilotChatProjectState(): CopilotChatProjectState {
  const state = useCopilotChatHistoryStore.getState();
  const sessions = persistedSessions(state.sessions);
  const activeSessionId = sessions.some(session => session.id === state.activeSessionId)
    ? state.activeSessionId
    : null;
  return {version: 1, activeSessionId, sessions};
}

export function restoreCopilotChatProjectState(projectState?: CopilotChatProjectState | null): void {
  useCopilotChatHistoryStore.getState().restoreProjectState(projectState);
}

export function resetCopilotChatHistoryForTests(): void {
  restoreCopilotChatProjectState(emptyCopilotChatProjectState());
}
