import type {GuideTargetId} from './copilotGuide';
import {GUIDE_TARGET_ID_SET} from './copilotGuide';
import {
  sanitizeCopilotMidiBlockEdits,
  type CopilotMidiBlockEdit,
} from './copilotMidiBlockEdits';
import {
  sanitizeCopilotMidiOptions,
  type CopilotMidiOption,
} from './copilotMidiOptions';
import {
  sanitizeCopilotDrumPatternEdits,
  sanitizeCopilotDrumPatternOptions,
  type CopilotDrumPatternEdit,
  type CopilotDrumPatternOption,
} from './copilotDrumPatternOptions';

export type CopilotRightPanel = 'samples' | 'browser' | 'audio';

export type CopilotUiAction =
  | {type: 'show_ui_guide'; targetId: GuideTargetId}
  | {type: 'reveal_ui_target'; targetId: GuideTargetId}
  | {type: 'focus_ui_target'; targetId: GuideTargetId}
  | {type: 'open_right_panel'; panel: CopilotRightPanel}
  | {type: 'set_mixer_open'; open: boolean};

export type CopilotAnswer = {
  text: string;
  actions: CopilotUiAction[];
  midiBlockEdits: CopilotMidiBlockEdit[];
  midiOptions: CopilotMidiOption[];
  drumPatternOptions: CopilotDrumPatternOption[];
  drumPatternEdits: CopilotDrumPatternEdit[];
};

const RIGHT_PANELS = new Set<CopilotRightPanel>(['samples', 'browser', 'audio']);

type SanitizeOptions = {
  visibleTargetIds?: Iterable<string>;
  revealTargetIds?: Iterable<string>;
  validTargetIds?: Iterable<string>;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function visibleTargetIdSet(options: SanitizeOptions): Set<string> {
  return new Set([
    ...GUIDE_TARGET_ID_SET,
    ...(options.visibleTargetIds ?? options.validTargetIds ?? []),
  ]);
}

function revealTargetIdSet(options: SanitizeOptions, visibleTargetIds: Set<string>): Set<string> {
  return new Set([
    ...visibleTargetIds,
    ...(options.revealTargetIds ?? options.validTargetIds ?? []),
  ]);
}

function validAction(
  value: unknown,
  visibleTargetIds: Set<string>,
  revealTargetIds: Set<string>,
): CopilotUiAction | null {
  if (!record(value) || typeof value.type !== 'string') {
    return null;
  }
  if (
    value.type === 'show_ui_guide' &&
    typeof value.targetId === 'string' &&
    visibleTargetIds.has(value.targetId)
  ) {
    return {type: 'show_ui_guide', targetId: value.targetId as GuideTargetId};
  }
  if (
    value.type === 'reveal_ui_target' &&
    typeof value.targetId === 'string' &&
    revealTargetIds.has(value.targetId)
  ) {
    return {type: 'reveal_ui_target', targetId: value.targetId as GuideTargetId};
  }
  if (
    value.type === 'focus_ui_target' &&
    typeof value.targetId === 'string' &&
    visibleTargetIds.has(value.targetId)
  ) {
    return {type: 'focus_ui_target', targetId: value.targetId as GuideTargetId};
  }
  if (
    value.type === 'open_right_panel' &&
    typeof value.panel === 'string' &&
    RIGHT_PANELS.has(value.panel as CopilotRightPanel)
  ) {
    return {type: 'open_right_panel', panel: value.panel as CopilotRightPanel};
  }
  if (value.type === 'set_mixer_open' && typeof value.open === 'boolean') {
    return {type: 'set_mixer_open', open: value.open};
  }
  return null;
}

export function sanitizeCopilotAnswer(value: unknown, options: SanitizeOptions = {}): CopilotAnswer {
  if (!record(value)) {
    return {
      text: 'I could not read that response. Try asking again.',
      actions: [],
      midiBlockEdits: [],
      midiOptions: [],
      drumPatternOptions: [],
      drumPatternEdits: [],
    };
  }
  const visibleTargetIds = visibleTargetIdSet(options);
  const revealTargetIds = revealTargetIdSet(options, visibleTargetIds);
  const text = typeof value.text === 'string' && value.text.trim().length > 0
    ? value.text.trim()
    : 'I found a possible answer, but it did not include readable text.';
  const actions: CopilotUiAction[] = [];
  if (Array.isArray(value.actions)) {
    for (const rawAction of value.actions) {
      const action = validAction(rawAction, visibleTargetIds, revealTargetIds);
      if (action) {
        actions.push(action);
      }
    }
  }
  return {
    text,
    actions,
    midiBlockEdits: sanitizeCopilotMidiBlockEdits(value.midiBlockEdits),
    midiOptions: sanitizeCopilotMidiOptions(value.midiOptions),
    drumPatternOptions: sanitizeCopilotDrumPatternOptions(value.drumPatternOptions),
    drumPatternEdits: sanitizeCopilotDrumPatternEdits(value.drumPatternEdits),
  };
}
