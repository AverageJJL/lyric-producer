import {runAskAudioTool, type NativeCommandFn} from './askAudioTools';
import type {AskReport} from './askReportTypes';
import {clipEnd, entriesByPrefix, num, trackMap, type ClipFile} from './askSessionModel';
import type {ApcAgentTree} from './copilotAgentTools';
import {inspectTimelineBlocks} from './timelineBlockInventory';

export type AskShortcutResult = {text: string; reports: AskReport[]};

type AudioBlock = {
  id: string;
  name: string;
  trackName: string;
  startBeat: number;
  endBeat: number;
  audioFilePath: string;
};

type BeatWindow = {startBeat: number; endBeat: number} | null;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isInventoryAsk(message: string): boolean {
  return /\b(read|see|list|show|what|which|inspect)\b/.test(message)
    && /\b(blocks?|clips?|audio|midi|session|timeline)\b/.test(message);
}

function isLoudnessAsk(message: string): boolean {
  return /\b(loud|loudness|lufs|rms|peak|level|levels)\b/.test(message);
}

function isMaskingAsk(message: string): boolean {
  return /\b(mask|masking|clash|clashing|mud|muddy|overlap|cover|competing)\b/.test(message);
}

function isReferenceAsk(message: string): boolean {
  return /\b(reference|ref|compare)\b/.test(message) && /\b(low|bass|sub|bottom|200\s*hz)\b/.test(message);
}

function audioBlocks(tree: ApcAgentTree): AudioBlock[] {
  const tracks = trackMap(tree);
  return entriesByPrefix<ClipFile>(tree, 'clips/')
    .map(({data: clip}) => {
      const id = clean(clip.id);
      const audioFilePath = clean(clip.audioFilePath);
      if (clip.type !== 'audio' || !id || !audioFilePath || clip.patternId) {
        return null;
      }
      const track = clip.trackId ? tracks.get(clip.trackId) : undefined;
      return {
        id,
        name: clean(clip.name) || id,
        trackName: clean(track?.name) || clean(clip.trackId) || 'unassigned',
        startBeat: num(clip.startBeat),
        endBeat: clipEnd(clip),
        audioFilePath,
      };
    })
    .filter((block): block is AudioBlock => block !== null)
    .sort((a, b) => a.startBeat - b.startBeat || a.name.localeCompare(b.name));
}

function ordinalIndex(message: string): number | null {
  if (/\b(first|1st)\b/.test(message)) return 0;
  if (/\b(second|2nd)\b/.test(message)) return 1;
  if (/\b(third|3rd)\b/.test(message)) return 2;
  if (/\b(last|final)\b/.test(message)) return -1;
  return null;
}

function scoreBlock(message: string, block: AudioBlock, role: 'target' | 'reference'): number {
  const name = norm(block.name);
  const text = norm(message);
  let score = text.includes(name) && name.length > 0 ? 8 : 0;
  for (const word of name.split(' ')) {
    if (word.length >= 3 && text.includes(word)) {
      score += 1;
    }
  }
  if (role === 'reference' && /\b(reference|ref)\b/.test(name)) {
    score += 6;
  }
  if (role === 'target' && /\b(reference|ref)\b/.test(name)) {
    score -= 4;
  }
  return score;
}

function chooseBlock(message: string, blocks: AudioBlock[], role: 'target' | 'reference', excludeId?: string): AudioBlock | null {
  const candidates = blocks.filter(block => block.id !== excludeId);
  if (candidates.length === 0) return null;
  if (role === 'reference' && /\b(reference|ref)\b/.test(message)) {
    const named = candidates.find(block => /\b(reference|ref)\b/.test(norm(block.name)));
    return named ?? candidates[candidates.length - 1];
  }
  const ordinal = ordinalIndex(message);
  if (role === 'target' && ordinal !== null) {
    return ordinal === -1 ? candidates[candidates.length - 1] : candidates[Math.min(ordinal, candidates.length - 1)] ?? null;
  }
  const ranked = [...candidates].sort((a, b) => scoreBlock(message, b, role) - scoreBlock(message, a, role));
  const best = ranked[0];
  if (scoreBlock(message, best, role) > 0) {
    return best;
  }
  return role === 'reference' ? candidates[candidates.length - 1] : candidates[0];
}

function beatWindow(message: string): BeatWindow {
  const match = message.match(/\b(?:around|near|at|beat)\s+beat\s+(\d+(?:\.\d+)?)/)
    ?? message.match(/\bbeat\s+(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const beat = Number(match[1]);
  if (!Number.isFinite(beat)) return null;
  return {startBeat: Math.max(0, beat - 4), endBeat: beat + 4};
}

function blockMentionIndex(message: string, block: AudioBlock): number {
  const text = norm(message);
  const name = norm(block.name);
  if (!name) return -1;
  const exact = text.indexOf(name);
  if (exact >= 0) return exact;
  const words = name.split(' ').filter(word => word.length >= 4);
  const hits = words.map(word => text.indexOf(word)).filter(index => index >= 0);
  return hits.length > 0 ? Math.min(...hits) : -1;
}

function overlaps(a: AudioBlock, b: AudioBlock, window: BeatWindow): boolean {
  const start = Math.max(a.startBeat, b.startBeat, window?.startBeat ?? -Infinity);
  const end = Math.min(a.endBeat, b.endBeat, window?.endBeat ?? Infinity);
  return end > start;
}

function chooseMaskingPair(message: string, blocks: AudioBlock[]): [AudioBlock, AudioBlock] | null {
  if (blocks.length < 2) return null;
  const window = beatWindow(message);
  const text = norm(message);
  const maskIndex = text.indexOf(' mask');
  const inIndex = maskIndex >= 0 ? text.indexOf(' in ', maskIndex) : -1;
  if (maskIndex >= 0 && inIndex > maskIndex) {
    const mentions = blocks
      .map(block => ({block, index: blockMentionIndex(message, block)}))
      .filter(item => item.index >= 0);
    const masker = mentions.filter(item => item.index < maskIndex).sort((a, b) => b.index - a.index)[0]?.block;
    const target = mentions.filter(item => item.index > inIndex).sort((a, b) => a.index - b.index)[0]?.block;
    if (target && masker && target.id !== masker.id && overlaps(target, masker, window)) {
      return [target, masker];
    }
  }
  const target = chooseBlock(message, blocks, 'target') ?? blocks[0];
  const partner = blocks.find(block => block.id !== target.id && overlaps(target, block, window))
    ?? blocks.find(block => block.id !== target.id)
    ?? null;
  return partner ? [target, partner] : null;
}

function unavailable(text: string): AskShortcutResult {
  return {text, reports: []};
}

function reportResult(tool: ReturnType<typeof runAskAudioTool>): {available: boolean; reason?: string} {
  const result = tool?.result;
  if (!result || typeof result !== 'object') return {available: false, reason: 'measurement returned no result'};
  const available = (result as {available?: unknown}).available === true;
  const reason = clean((result as {reason?: unknown}).reason);
  return {available, reason: reason || undefined};
}

function inventoryShortcut(tree: ApcAgentTree): AskShortcutResult {
  const out = inspectTimelineBlocks(tree, {maxResults: 12});
  const result = out.result as {blocks?: Array<{name?: string; kind?: string; trackName?: string; startBeat?: number; endBeat?: number}>; demoPrompts?: string[]};
  const blocks = Array.isArray(result.blocks) ? result.blocks : [];
  const lines = blocks.slice(0, 6).map(block => {
    const name = clean(block.name) || '(unnamed)';
    const track = clean(block.trackName) || 'unassigned';
    const start = typeof block.startBeat === 'number' ? block.startBeat.toFixed(1) : '?';
    const end = typeof block.endBeat === 'number' ? block.endBeat.toFixed(1) : '?';
    return `- ${name} (${block.kind ?? 'block'}) on ${track}, beats ${start}-${end}`;
  });
  const prompts = Array.isArray(result.demoPrompts) ? result.demoPrompts.slice(0, 2) : [];
  const extra = prompts.length > 0 ? `\n\nGood follow-up demos:\n${prompts.map(prompt => `- ${prompt}`).join('\n')}` : '';
  return {
    text: lines.length > 0 ? `I can read these timeline blocks:\n${lines.join('\n')}${extra}` : 'I can read the session, but there are no timeline blocks yet.',
    reports: out.report ? [out.report] : [],
  };
}

function loudnessShortcut(tree: ApcAgentTree, message: string, send: NativeCommandFn | undefined): AskShortcutResult {
  const block = chooseBlock(message, audioBlocks(tree), 'target');
  if (!block) {
    return unavailable('I can read the session, but I do not see a file-backed audio block to measure.');
  }
  const tool = runAskAudioTool(tree, send, 'measure_loudness', {clipId: block.id});
  const status = reportResult(tool);
  if (!status.available) {
    return unavailable(`I found "${block.name}", but the engine could not measure loudness: ${status.reason ?? 'measurement unavailable'}.`);
  }
  return {
    text: tool?.report?.headline
      ? `${block.name} on ${block.trackName}: ${tool.report.headline}.`
      : `I measured loudness for "${block.name}" on ${block.trackName}.`,
    reports: tool?.report ? [tool.report] : [],
  };
}

function maskingShortcut(tree: ApcAgentTree, message: string, send: NativeCommandFn | undefined): AskShortcutResult {
  const blocks = audioBlocks(tree);
  const pair = chooseMaskingPair(message, blocks);
  if (!pair) {
    return unavailable('Masking analysis needs at least two file-backed audio blocks that can be measured by the engine.');
  }
  const window = beatWindow(message);
  const args = {clipIdA: pair[0].id, clipIdB: pair[1].id, ...(window ?? {})};
  const tool = runAskAudioTool(tree, send, 'analyze_masking', args);
  const status = reportResult(tool);
  if (!status.available) {
    return unavailable(`I found "${pair[0].name}" and "${pair[1].name}", but masking analysis is unavailable: ${status.reason ?? 'measurement unavailable'}.`);
  }
  return {
    text: tool?.report?.headline
      ? `${tool.report.headline} Checked ${pair[1].name} against ${pair[0].name}.`
      : `I checked masking between "${pair[1].name}" and "${pair[0].name}".`,
    reports: tool?.report ? [tool.report] : [],
  };
}

function referenceShortcut(tree: ApcAgentTree, message: string, send: NativeCommandFn | undefined): AskShortcutResult {
  const blocks = audioBlocks(tree);
  const project = chooseBlock(message, blocks, 'target');
  const reference = chooseBlock(message, blocks, 'reference', project?.id);
  if (!project || !reference) {
    return unavailable('Low-end reference comparison needs two file-backed audio blocks: one project clip and one reference clip.');
  }
  const tool = runAskAudioTool(tree, send, 'compare_reference_low_end', {
    projectClipId: project.id,
    referenceClipId: reference.id,
    crossoverHz: 200,
  });
  const status = reportResult(tool);
  if (!status.available) {
    return unavailable(`I found "${project.name}" and "${reference.name}", but low-end comparison is unavailable: ${status.reason ?? 'measurement unavailable'}.`);
  }
  return {
    text: tool?.report?.headline
      ? `${tool.report.headline} Compared ${project.name} against ${reference.name}.`
      : `I compared the low end of "${project.name}" against "${reference.name}".`,
    reports: tool?.report ? [tool.report] : [],
  };
}

export function buildAskShortcut(message: string, tree: ApcAgentTree, send: NativeCommandFn | undefined): AskShortcutResult | null {
  const text = message.toLowerCase();
  if (isReferenceAsk(text)) {
    return referenceShortcut(tree, text, send);
  }
  if (isMaskingAsk(text)) {
    return maskingShortcut(tree, text, send);
  }
  if (isLoudnessAsk(text)) {
    return loudnessShortcut(tree, text, send);
  }
  if (isInventoryAsk(text)) {
    return inventoryShortcut(tree);
  }
  return null;
}
