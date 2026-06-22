import type {ApcPatchTransaction} from './copilotAgentContract';
import type {ApcAgentTree} from './copilotAgentTools';

type ChatMessage = {role?: unknown; content?: unknown};
type ClipFile = {type?: unknown; startBeat?: unknown; lengthBeats?: unknown; audioFilePath?: unknown; absoluteAudioFilePath?: unknown};
type TimelineFile = {timeSignature?: {numerator?: unknown}; sections?: unknown};
type Section = {id: string; name: string; startBeat: number; lengthBeats: number};
type BeatRange = {startBeat: number; endBeat: number};

export type CopilotTimelineShortcutResult = {
  text: string;
  patch: ApcPatchTransaction;
};

function readJson<T>(tree: ApcAgentTree, path: string): T | null {
  try {
    return JSON.parse(tree.files[path] ?? 'null') as T;
  } catch {
    return null;
  }
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function hashOf(tree: ApcAgentTree, path: string): string | null {
  return tree.index.find(entry => entry.path === path)?.contentHash ?? null;
}

function recentText(message: string, history?: unknown): string {
  const items = Array.isArray(history) ? history.slice(-6) as ChatMessage[] : [];
  return [...items.map(item => cleanString(item.content) ?? ''), message].join('\n');
}

function textConfirms(text: string): boolean {
  return /^(yes|yeah|yep|sure|ok|okay|do it|go ahead|please do|proceed|yes please|yes do it)[.!]*$/i
    .test(text.trim());
}

function recentAssistantAsked(history: unknown, pattern: RegExp): boolean {
  const items = Array.isArray(history) ? history.slice(-3) as ChatMessage[] : [];
  return items.some(item => {
    const content = cleanString(item.content) ?? '';
    return item.role === 'assistant' && content.includes('?') && pattern.test(content);
  });
}

function validSections(value: unknown): Section[] {
  return Array.isArray(value)
    ? value.filter((item): item is Section => {
      const section = item as Section;
      return cleanString(section.id) !== null && cleanString(section.name) !== null &&
        finiteNumber(section.startBeat) !== null && finiteNumber(section.lengthBeats) !== null &&
        section.lengthBeats > 0;
    })
    : [];
}

function barBeats(timeline: TimelineFile): number {
  const numerator = finiteNumber(timeline.timeSignature?.numerator);
  return numerator && numerator > 0 ? numerator : 4;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'section';
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function titleCase(name: string): string {
  return name.split(/\s+/).map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function rangeFromText(text: string, barLength: number): BeatRange | null {
  const match = text.match(/\b(?:(bar|bars|measure|measures|beat|beats)\s*)?(\d+(?:\.\d+)?)\s*(?:to|-|through|until)\s*(?:(bar|bars|measure|measures|beat|beats)\s*)?(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const unit = (match[1] ?? match[3] ?? '').toLowerCase();
  const scale = /bar|measure/.test(unit) ? barLength : 1;
  const startBeat = Number(match[2]) * scale;
  const endBeat = Number(match[4]) * scale;
  return Number.isFinite(startBeat) && Number.isFinite(endBeat) && endBeat > startBeat
    ? {startBeat, endBeat}
    : null;
}

function markerName(text: string): string | null {
  const quoted = text.match(/["']([^"']{1,48})["']/)?.[1];
  if (quoted) return quoted.trim();
  const named = text.match(/\b(?:named|called|label(?:ed)?(?: as)?|name it)\s+([a-z][a-z0-9 /-]{0,40})/i)?.[1];
  if (named) return named.trim();
  const phrase = text.match(/\b(?:add|create|make|set)\s+(?:an?\s+|the\s+)?([a-z][a-z0-9 -]{0,30}?)\s+(?:section\s+)?marker\b/i)?.[1];
  if (phrase) return phrase.trim();
  const role = text.match(/\b(intro|verse|pre[- ]?chorus|chorus|hook|bridge|drop|breakdown|outro)\b/i)?.[1];
  return role ? role.replace(/-/g, ' ') : null;
}

function buildMarker(message: string, tree: ApcAgentTree, history?: unknown): CopilotTimelineShortcutResult | null {
  const timelineHash = hashOf(tree, 'timeline.json');
  const timeline = readJson<TimelineFile>(tree, 'timeline.json');
  if (!timelineHash || !timeline) return null;
  const combined = recentText(message, history);
  const direct = /\b(marker|section)\b/i.test(message) && /\b(add|create|make|set|label|name)\b/i.test(message);
  const confirmingPrevious = textConfirms(message) && recentAssistantAsked(history, /\b(section\s+)?marker\b/i);
  const answeringMarkerName = recentAssistantAsked(history, /\b(section\s+)?marker\b/i) &&
    markerName(message) !== null &&
    rangeFromText(combined, barBeats(timeline)) !== null;
  if (!direct && !confirmingPrevious && !answeringMarkerName) return null;
  const contextText = direct ? message : combined;
  const range = rangeFromText(contextText, barBeats(timeline));
  const name = markerName(message) ?? markerName(contextText);
  if (!range || !name) return null;
  const kept = validSections(timeline.sections);
  const label = titleCase(name);
  const id = uniqueId(`ai-marker-${slug(label)}-${Math.round(range.startBeat)}`, new Set(kept.map(section => section.id)));
  const section = {id, name: label, startBeat: range.startBeat, lengthBeats: range.endBeat - range.startBeat};
  return {
    text: `Prepared a section marker named "${label}" from beat ${range.startBeat} to beat ${range.endBeat}.`,
    patch: {schemaVersion: 1, baseFingerprint: tree.fingerprint, summary: `Add ${label} section marker`, changes: [
      {op: 'mergeFields', path: 'timeline.json', beforeHash: timelineHash, fields: {sections: [...kept, section].sort((a, b) => a.startBeat - b.startBeat)}},
    ]},
  };
}

function audioExtent(tree: ApcAgentTree): BeatRange | null {
  const ranges = Object.keys(tree.files)
    .filter(path => path.startsWith('clips/') && path.endsWith('.json'))
    .map(path => readJson<ClipFile>(tree, path))
    .map(clip => {
      const startBeat = finiteNumber(clip?.startBeat);
      const lengthBeats = finiteNumber(clip?.lengthBeats);
      const fileBacked = Boolean(cleanString(clip?.audioFilePath) ?? cleanString(clip?.absoluteAudioFilePath));
      return clip?.type === 'audio' && fileBacked && startBeat !== null && lengthBeats && lengthBeats > 0
        ? {startBeat, endBeat: startBeat + lengthBeats}
        : null;
    })
    .filter((range): range is BeatRange => range !== null);
  return ranges.length ? {startBeat: Math.min(...ranges.map(r => r.startBeat)), endBeat: Math.max(...ranges.map(r => r.endBeat))} : null;
}

function matchingSectionRange(sections: Section[], text: string): BeatRange | null {
  const wanted = ['chorus', 'hook', 'main', 'groove', 'drop', 'verse', 'bridge', 'intro', 'outro']
    .filter(word => new RegExp(`\\b${word}\\b`, 'i').test(text));
  if (!wanted.length) return null;
  const matches = sections.filter(section => wanted.some(word => section.name.toLowerCase().includes(word)));
  return matches.length
    ? {startBeat: Math.min(...matches.map(s => s.startBeat)), endBeat: Math.max(...matches.map(s => s.startBeat + s.lengthBeats))}
    : null;
}

function estimatedCycleRange(text: string, timeline: TimelineFile, tree: ApcAgentTree): BeatRange | null {
  const barLength = barBeats(timeline);
  const explicit = rangeFromText(text, barLength);
  if (explicit) return explicit;
  const section = matchingSectionRange(validSections(timeline.sections), text);
  if (section) return section;
  const extent = audioExtent(tree);
  if (!extent) return null;
  if (/\b(all|whole|entire|full)\b/i.test(text)) return extent;
  const total = extent.endBeat - extent.startBeat;
  const targetLength = Math.min(total, Math.max(barLength * 8, Math.min(barLength * 16, total / 3)));
  const rawStart = extent.startBeat + Math.max(0, (total - targetLength) * 0.38);
  const startBeat = Math.max(extent.startBeat, Math.round(rawStart / barLength) * barLength);
  const endBeat = Math.min(extent.endBeat, Math.round((startBeat + targetLength) / barLength) * barLength);
  return endBeat > startBeat ? {startBeat, endBeat} : extent;
}

function buildCycle(message: string, tree: ApcAgentTree, history?: unknown): CopilotTimelineShortcutResult | null {
  const projectHash = hashOf(tree, 'project.json');
  const timeline = readJson<TimelineFile>(tree, 'timeline.json') ?? {};
  if (!projectHash) return null;
  const combined = recentText(message, history);
  const direct = wantsCycle(message);
  const confirmingPrevious = textConfirms(message) && recentAssistantAsked(history, /\bcycle\b/i);
  if (!direct && !confirmingPrevious) return null;
  const contextText = confirmingPrevious ? combined : message;
  const range = estimatedCycleRange(contextText, timeline, tree);
  if (!range) return null;
  const estimated = rangeFromText(contextText, barBeats(timeline)) ? '' : 'estimated ';
  return {
    text: `Prepared an ${estimated}cycle range from beat ${range.startBeat} to beat ${range.endBeat}.`,
    patch: {schemaVersion: 1, baseFingerprint: tree.fingerprint, summary: 'Set cycle range', changes: [
      {op: 'mergeFields', path: 'project.json', beforeHash: projectHash, fields: {isCycleEnabled: true, cycleStartBeat: range.startBeat, cycleEndBeat: range.endBeat}},
    ]},
  };
}

function wantsCycle(text: string): boolean {
  return /\bcycle\b/i.test(text) &&
    /\b(add|set|create|make|range|over|around|cover|find)\b/i.test(text);
}

export function buildTimelineMetadataShortcut(
  message: string,
  tree: ApcAgentTree,
  history?: unknown,
): CopilotTimelineShortcutResult | null {
  if (wantsCycle(message)) {
    return buildCycle(message, tree, history) ?? buildMarker(message, tree, history);
  }
  return buildMarker(message, tree, history) ?? buildCycle(message, tree, history);
}
