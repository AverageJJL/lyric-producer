import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {
  sanitizeCopilotAnswer,
  type CopilotAnswer,
  type CopilotUiAction,
} from '../../assistant/copilotActions';
import {
  buildCopilotContextPayload,
  copilotRevealTargetIds,
  copilotVisibleTargetIds,
  type CopilotContextPayload,
} from '../../assistant/copilotContext';
import {
  buildCopilotEditableArrangementSummary,
  type CopilotEditableArrangementSummary,
} from '../../assistant/copilotArrangementContext';
import {
  applyCopilotMidiBlockEdits,
  type CopilotMidiBlockEdit,
} from '../../assistant/copilotMidiBlockEdits';
import {
  applyCopilotDrumPatternEdits,
  type CopilotDrumPatternEdit,
} from '../../assistant/copilotDrumPatternOptions';
import {CopilotInputForm} from './CopilotInputForm';
import {CopilotMessageArticle, type PanelMessage} from './CopilotMessageArticle';
import {CopilotPendingDrumPatternEditCard} from './CopilotPendingDrumPatternEditCard';
import {CopilotPendingMidiEditCard} from './CopilotPendingMidiEditCard';
import {useCopilotProjectContext} from './useCopilotProjectContext';
import {useCopilotDrumPatternController} from './useCopilotDrumPatternController';
import {useCopilotMidiOptionController} from './useCopilotMidiOptionController';
import {
  getCopilotBridge,
  type CopilotUiState,
} from '../../native/copilotApi';
import {activeTracks, blocksForActiveTracks} from '../../music/trackOrganization';
import {useDAWStore} from '../../store/useDAWStore';

type CopilotPanelProps = {
  uiState: CopilotUiState;
  onActions: (actions: CopilotUiAction[], context: CopilotContextPayload) => void;
};

type PendingMidiEdit = {
  id: string;
  edits: CopilotMidiBlockEdit[];
  error?: string;
};

type PendingDrumPatternEdit = {
  id: string;
  edits: CopilotDrumPatternEdit[];
  error?: string;
};

function messageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function CopilotPanel({uiState, onActions}: CopilotPanelProps) {
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [pendingMidiEdit, setPendingMidiEdit] = useState<PendingMidiEdit | null>(null);
  const [pendingDrumPatternEdit, setPendingDrumPatternEdit] = useState<PendingDrumPatternEdit | null>(null);
  const activeRequestRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bridge = getCopilotBridge();
  const tracks = useDAWStore(state => state.tracks);
  const blocks = useDAWStore(state => state.blocks);
  const patterns = useDAWStore(state => state.patterns);
  const selectedTrackId = useDAWStore(state => state.selectedTrackId);
  const selectedBlockId = useDAWStore(state => state.selectedBlockId);
  const selectedBlockIds = useDAWStore(state => state.selectedBlockIds);
  const playheadBeat = useDAWStore(state => state.playheadBeat);
  const projectContext = useCopilotProjectContext();
  const chatHistory = useMemo(
    () => messages
      .filter(message => !message.error)
      .map(({role, content}) => ({role, content}))
      .slice(-6),
    [messages],
  );
  const editableArrangement = useMemo<CopilotEditableArrangementSummary>(() => {
    const visibleTracks = activeTracks(tracks);
    return buildCopilotEditableArrangementSummary({
      tracks: visibleTracks,
      blocks: blocksForActiveTracks(blocks, tracks),
      patterns,
      selectedTrackId,
      selectedBlockId,
      selectedBlockIds,
      playheadBeat,
    });
  }, [blocks, patterns, playheadBeat, selectedBlockId, selectedBlockIds, selectedTrackId, tracks]);

  const focusInput = useCallback(() => {
    textareaRef.current?.focus({preventScroll: true});
  }, []);

  const scheduleFocusInput = useCallback(() => {
    if (window.requestAnimationFrame) {
      const frame = window.requestAnimationFrame(focusInput);
      return () => window.cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(focusInput, 0);
    return () => window.clearTimeout(timer);
  }, [focusInput]);

  useEffect(() => {
    return scheduleFocusInput();
  }, [scheduleFocusInput]);
  const midiOptions = useCopilotMidiOptionController(scheduleFocusInput);
  const drumPatterns = useCopilotDrumPatternController(scheduleFocusInput);

  const appendAssistant = (
    answer: CopilotAnswer,
    model: string,
    context: CopilotContextPayload,
    requestId: number,
  ) => {
    if (activeRequestRef.current !== requestId) {
      return;
    }
    setMessages(current => [
      ...current,
      {
        id: messageId('assistant'),
        role: 'assistant',
        content: answer.text,
        model,
        midiOptions: answer.midiOptions,
        drumPatternOptions: answer.drumPatternOptions,
      },
    ]);
    setPendingMidiEdit(answer.midiBlockEdits.length > 0
      ? {id: messageId('midi-edit'), edits: answer.midiBlockEdits}
      : null);
    setPendingDrumPatternEdit(answer.drumPatternEdits.length > 0
      ? {id: messageId('drum-edit'), edits: answer.drumPatternEdits}
      : null);
    onActions(answer.actions, context);
  };


  const appendError = (error: string, requestId: number) => {
    if (activeRequestRef.current !== requestId) {
      return;
    }
    setMessages(current => [
      ...current,
      {id: messageId('error'), role: 'assistant', content: error, error: true},
    ]);
  };

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || isPending) {
      return;
    }
    setDraft('');
    setIsPending(true);
    setPendingMidiEdit(null);
    setPendingDrumPatternEdit(null);
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    setMessages(current => [...current, {id: messageId('user'), role: 'user', content: message}]);
    scheduleFocusInput();
    const context = buildCopilotContextPayload(uiState, editableArrangement, projectContext);

    if (!bridge) {
      appendError('Copilot is not available in this renderer.', requestId);
      setIsPending(false);
      return;
    }

    try {
      const response = await bridge.ask({
        message,
        history: chatHistory,
        uiState,
        context,
      });
      if (activeRequestRef.current === requestId) {
        setIsPending(false);
      }
      if (response.ok) {
        appendAssistant(
          sanitizeCopilotAnswer(response.answer, {
            visibleTargetIds: copilotVisibleTargetIds(context),
            revealTargetIds: copilotRevealTargetIds(context),
          }),
          response.model,
          context,
          requestId,
        );
        return;
      }
      appendError(response.error, requestId);
    } catch {
      if (activeRequestRef.current === requestId) {
        setIsPending(false);
      }
      appendError('Copilot request failed before a response was returned.', requestId);
    }
  };

  const applyPendingMidiEdit = () => {
    if (!pendingMidiEdit) {
      return;
    }
    const result = applyCopilotMidiBlockEdits(pendingMidiEdit.edits);
    if (!result.ok) {
      setPendingMidiEdit({...pendingMidiEdit, error: result.error});
      scheduleFocusInput();
      return;
    }
    setPendingMidiEdit(null);
    setMessages(current => [
      ...current,
      {id: messageId('assistant'), role: 'assistant', content: result.message},
    ]);
    scheduleFocusInput();
  };

  const cancelPendingMidiEdit = () => {
    setPendingMidiEdit(null);
    scheduleFocusInput();
  };

  const applyPendingDrumPatternEdit = () => {
    if (!pendingDrumPatternEdit) {
      return;
    }
    const result = applyCopilotDrumPatternEdits(pendingDrumPatternEdit.edits);
    if (!result.ok) {
      setPendingDrumPatternEdit({...pendingDrumPatternEdit, error: result.error});
      scheduleFocusInput();
      return;
    }
    setPendingDrumPatternEdit(null);
    setMessages(current => [
      ...current,
      {id: messageId('assistant'), role: 'assistant', content: result.message},
    ]);
    scheduleFocusInput();
  };

  const cancelPendingDrumPatternEdit = () => {
    setPendingDrumPatternEdit(null);
    scheduleFocusInput();
  };

  return (
    <section className="copilot-panel" aria-label="Copilot chat">
      <div className="copilot-thread" aria-live="polite">
        {messages.map(message => (
          <CopilotMessageArticle
            key={message.id}
            message={message}
            midiOptions={midiOptions}
            drumPatterns={drumPatterns}
          />
        ))}
        {isPending ? (
          <article className="copilot-message assistant pending">
            <span className="copilot-message-role">Copilot</span>
            <p className="copilot-message-plain">Thinking...</p>
          </article>
        ) : null}
        {pendingMidiEdit ? (
          <CopilotPendingMidiEditCard
            pendingMidiEdit={pendingMidiEdit}
            onApply={applyPendingMidiEdit}
            onCancel={cancelPendingMidiEdit}
          />
        ) : null}
        {pendingDrumPatternEdit ? (
          <CopilotPendingDrumPatternEditCard
            pendingDrumPatternEdit={pendingDrumPatternEdit}
            onApply={applyPendingDrumPatternEdit}
            onCancel={cancelPendingDrumPatternEdit}
          />
        ) : null}
      </div>
      <CopilotInputForm
        draft={draft}
        isPending={isPending}
        textareaRef={textareaRef}
        onDraftChange={setDraft}
        onSend={() => void sendMessage()}
      />
    </section>
  );
}
