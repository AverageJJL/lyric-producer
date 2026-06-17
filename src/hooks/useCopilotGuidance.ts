import {useCallback, useState} from 'react';

import type {CopilotUiAction} from '../assistant/copilotActions';
import {findCopilotTargetElement, type CopilotContextPayload} from '../assistant/copilotContext';
import type {GuideTargetId} from '../assistant/copilotGuide';
import {revealCopilotTarget} from '../assistant/copilotRevealRegistry';
import type {useWorkspacePanels} from './useWorkspacePanels';

export function useCopilotGuidance(workspacePanels: ReturnType<typeof useWorkspacePanels>) {
  const [guideTargetId, setGuideTargetId] = useState<GuideTargetId | null>(null);
  const [copilotTargets, setCopilotTargets] = useState<CopilotContextPayload['visibleTargets']>([]);

  const handleCopilotActions = useCallback(
    (actions: CopilotUiAction[], context: CopilotContextPayload) => {
      let nextGuideTargetId: GuideTargetId | null = null;
      setCopilotTargets(context.visibleTargets);
      actions.forEach(action => {
        if (action.type === 'open_right_panel') {
          workspacePanels.openRightPanel(action.panel);
        }
        if (action.type === 'set_mixer_open') {
          workspacePanels.setMixerOpen(action.open);
        }
        if (action.type === 'show_ui_guide') {
          nextGuideTargetId = action.targetId;
        }
        if (action.type === 'reveal_ui_target') {
          revealCopilotTarget(action.targetId);
          nextGuideTargetId = action.targetId;
        }
        if (action.type === 'focus_ui_target') {
          window.requestAnimationFrame(() => findCopilotTargetElement(action.targetId)?.focus());
          nextGuideTargetId = action.targetId;
        }
      });
      window.requestAnimationFrame(() => setGuideTargetId(nextGuideTargetId));
    },
    [workspacePanels],
  );

  return {
    guideTargetId,
    copilotTargets,
    clearGuide: () => setGuideTargetId(null),
    handleCopilotActions,
  };
}
