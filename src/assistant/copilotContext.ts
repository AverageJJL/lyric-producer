import {GUIDE_TARGETS} from './copilotGuide';
import {
  emptyCopilotEditableArrangementSummary,
  type CopilotEditableArrangementSummary,
} from './copilotArrangementContext';
import {
  buildCopilotCatalogContext,
  defaultCopilotMusicalContext,
  defaultCopilotTransportContext,
  normalizeCopilotSections,
  type CopilotCatalogContext,
  type CopilotMusicalContext,
  type CopilotProjectContextInput,
  type CopilotSectionSummary,
  type CopilotTransportContext,
} from './copilotProjectContext';

export type CopilotProjectSummary = {
  rightPanel: string | null;
  isMixerOpen: boolean;
  selectedTrackId?: string | null;
  selectedTrackName?: string;
  selectedBlockName?: string;
  trackCount: number;
  hasSelectedBlock: boolean;
  bpm: number;
  isPlaying: boolean;
  isRecording: boolean;
  visibleTrackNames: string[];
};

export type CopilotVisibleTarget = {
  id: string;
  label: string;
  role: string;
  group?: string;
  purpose?: string;
  value?: string;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  expanded?: boolean;
};

export type CopilotWorkflowSummary = {
  id: string;
  label: string;
  purpose: string;
  entrypointTargetId: string;
};

export type CopilotContextPayload = {
  schemaVersion: 3;
  capturedAt: string;
  project: CopilotProjectSummary;
  musical: CopilotMusicalContext;
  transport: CopilotTransportContext;
  sections: CopilotSectionSummary[];
  arrangement: CopilotEditableArrangementSummary;
  catalog: CopilotCatalogContext;
  visibleTargets: CopilotVisibleTarget[];
  workflows: CopilotWorkflowSummary[];
};

const TARGET_SELECTOR = [
  '[data-copilot-id]',
  '[data-guide-target]',
  'button',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="dialog"]',
  '[role="complementary"]',
  '[role="group"]',
  'input',
  'select',
  'textarea',
  '[aria-label]',
].join(',');

const MAX_TARGETS = 180;
const PATH_PATTERN = /(?:file:\/\/|\/(?:Users|Volumes|private|var|tmp)\/|[A-Za-z]:\\|\\\\)/i;

function cleanText(value: string | null | undefined, maxLength = 90): string | undefined {
  const compact = value?.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return undefined;
  }
  if (PATH_PATTERN.test(compact)) {
    return '[path redacted]';
  }
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'target';
}

function visible(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0
    && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
}

function roleFor(element: HTMLElement): string {
  const explicit = element.getAttribute('role');
  if (explicit) {
    return explicit;
  }
  const tag = element.tagName.toLowerCase();
  if (tag === 'select') {
    return 'combobox';
  }
  if (tag === 'textarea') {
    return 'textbox';
  }
  if (tag === 'input') {
    return (element as HTMLInputElement).type || 'input';
  }
  return tag;
}

function labelFor(element: HTMLElement): string | undefined {
  const labelledBy = element.getAttribute('aria-labelledby');
  const labelledByText = labelledBy
    ?.split(/\s+/)
    .map(id => document.getElementById(id)?.textContent)
    .filter(Boolean)
    .join(' ');
  const label = element.closest('label')?.textContent;
  return cleanText(
    element.dataset.copilotLabel ??
    element.getAttribute('aria-label') ??
    labelledByText ??
    element.getAttribute('title') ??
    (element.matches('button,[role="button"],[role="menuitem"]') ? element.textContent : label),
  );
}

function groupFor(element: HTMLElement): string | undefined {
  const group = element.closest('[data-copilot-group],[role="dialog"],[role="complementary"],[role="group"],section[aria-label],aside[aria-label]');
  if (!group || group === element) {
    return undefined;
  }
  const groupElement = group as HTMLElement;
  return cleanText(groupElement.dataset.copilotGroup ?? groupElement.getAttribute('aria-label'));
}

function valueFor(element: HTMLElement): string | undefined {
  if (element instanceof HTMLSelectElement) {
    return cleanText(element.selectedOptions[0]?.textContent, 60);
  }
  if (element instanceof HTMLTextAreaElement) {
    return cleanText(element.value, 60);
  }
  if (element instanceof HTMLInputElement && !['password', 'file'].includes(element.type)) {
    return element.type === 'checkbox' ? undefined : cleanText(element.value, 60);
  }
  return undefined;
}

function legacyPurpose(id: string): string | undefined {
  return GUIDE_TARGETS.find(target => target.id === id)?.purpose;
}

function uniqueId(baseId: string, counts: Map<string, number>): string {
  const count = (counts.get(baseId) ?? 0) + 1;
  counts.set(baseId, count);
  return count === 1 ? baseId : `${baseId}:${count}`;
}

function targetFromElement(element: HTMLElement, counts: Map<string, number>): CopilotVisibleTarget | null {
  const label = labelFor(element);
  if (!label) {
    return null;
  }
  const role = roleFor(element);
  const rawId = element.dataset.copilotId ?? element.getAttribute('data-guide-target') ?? `visible:${role}:${slug(label)}`;
  const id = uniqueId(rawId, counts);
  element.setAttribute('data-copilot-scan-id', id);
  return {
    id,
    label,
    role,
    group: groupFor(element),
    purpose: cleanText(element.dataset.copilotPurpose ?? legacyPurpose(rawId), 120),
    value: valueFor(element),
    disabled: 'disabled' in element ? (element as HTMLButtonElement).disabled : undefined,
    checked: element instanceof HTMLInputElement && element.type === 'checkbox' ? element.checked : undefined,
    selected: element.getAttribute('aria-selected') === 'true' || element.getAttribute('aria-pressed') === 'true',
    expanded: element.getAttribute('aria-expanded') === 'true',
  };
}

function selectedTrackWorkflows(project: CopilotProjectSummary): CopilotWorkflowSummary[] {
  if (!project.selectedTrackId) {
    return [];
  }
  return [{
    id: `workflow:${project.selectedTrackId}:volume`,
    label: 'Selected track volume',
    purpose: 'Open the selected track details popup and highlight its volume control.',
    entrypointTargetId: `track:${project.selectedTrackId}:volume`,
  }];
}

export function workflowCatalog(project: CopilotProjectSummary): CopilotWorkflowSummary[] {
  return [...GUIDE_TARGETS.map(target => ({
    id: `workflow:${target.id}`,
    label: target.label,
    purpose: target.purpose,
    entrypointTargetId: target.id,
  })), ...selectedTrackWorkflows(project)];
}

export function buildCopilotContextPayload(
  project: CopilotProjectSummary,
  arrangement: CopilotEditableArrangementSummary = emptyCopilotEditableArrangementSummary(),
  context: CopilotProjectContextInput = {},
): CopilotContextPayload {
  const counts = new Map<string, number>();
  const visibleTargets = Array.from(document.querySelectorAll(TARGET_SELECTOR))
    .filter(visible)
    .map(element => targetFromElement(element, counts))
    .filter((target): target is CopilotVisibleTarget => target !== null)
    .slice(0, MAX_TARGETS);
  return {
    schemaVersion: 3,
    capturedAt: new Date().toISOString(),
    project: {
      ...project,
      selectedTrackId: cleanText(project.selectedTrackId, 80),
      selectedTrackName: cleanText(project.selectedTrackName, 60),
      selectedBlockName: cleanText(project.selectedBlockName, 60),
      visibleTrackNames: project.visibleTrackNames.map(name => cleanText(name, 40) ?? '[unnamed]'),
    },
    musical: context.musical ?? defaultCopilotMusicalContext(project.bpm),
    transport: context.transport ?? defaultCopilotTransportContext(project.isPlaying, project.isRecording),
    sections: normalizeCopilotSections(context.sections),
    arrangement,
    catalog: context.catalog ?? buildCopilotCatalogContext(),
    visibleTargets,
    workflows: workflowCatalog(project),
  };
}

export function copilotVisibleTargetIds(context: CopilotContextPayload): string[] {
  return context.visibleTargets.map(target => target.id);
}

export function copilotRevealTargetIds(context: CopilotContextPayload): string[] {
  return [
    ...copilotVisibleTargetIds(context),
    ...context.workflows.map(workflow => workflow.entrypointTargetId),
  ];
}

export const copilotTargetIds = copilotRevealTargetIds;

function selectorEscape(value: string): string {
  const css = (globalThis as {CSS?: {escape?: (input: string) => string}}).CSS;
  return typeof css?.escape === 'function' ? css.escape(value) : value.replace(/["\\]/g, '\\$&');
}

export function findCopilotTargetElement(targetId: string): HTMLElement | null {
  const selectors = [
    `[data-copilot-scan-id="${selectorEscape(targetId)}"]`,
    `[data-copilot-id="${selectorEscape(targetId)}"]`,
    `[data-guide-target="${selectorEscape(targetId)}"]`,
  ];
  return document.querySelector(selectors.join(',')) as HTMLElement | null;
}
