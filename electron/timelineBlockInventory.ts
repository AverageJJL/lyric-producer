import type {ApcAgentTree} from './copilotAgentTools';
import type {AskReport, AskReportBar, AskToolResult} from './askReportTypes';
import {
  activeStepCount,
  clipEnd,
  entriesByPrefix,
  num,
  readJson,
  trackMap,
  type ClipFile,
} from './askSessionModel';

type BlockKind = 'audio' | 'midi' | 'drum' | 'unknown';
type InventoryArgs = {
  type?: unknown;
  blockIds?: unknown;
  minBeat?: unknown;
  maxBeat?: unknown;
  maxResults?: unknown;
};

type BlockRow = {
  id?: string;
  name: string;
  kind: BlockKind;
  trackId?: string;
  trackName?: string;
  startBeat: number;
  endBeat: number;
  lengthBeats: number;
  isLocked: boolean;
  trackLocked: boolean;
  trackFrozen: boolean;
  measurementReady?: boolean;
  audioFilePath?: string;
  durationSeconds?: number;
  noteCount?: number;
  pitchRange?: string;
  activeSteps?: number;
  density?: number;
};

const MAX_RESULTS = 80;
const PITCHES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function kindForClip(clip: ClipFile): BlockKind {
  if (clip.type === 'midi') return 'midi';
  if (clip.type === 'audio' && clip.patternId) return 'drum';
  if (clip.type === 'audio') return 'audio';
  return 'unknown';
}

function midiName(note: number): string {
  const pitch = PITCHES[((note % 12) + 12) % 12];
  return `${pitch}${Math.floor(note / 12) - 1}`;
}

function pitchRange(notes: unknown[] | undefined): string | undefined {
  const values = (notes ?? [])
    .map(note => (note && typeof note === 'object' ? (note as {note?: unknown}).note : null))
    .filter((note): note is number => typeof note === 'number' && Number.isFinite(note));
  if (values.length === 0) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? midiName(min) : `${midiName(min)}-${midiName(max)}`;
}

function idSet(value: unknown): Set<string> | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return ids.length > 0 ? new Set(ids) : null;
}

function requestedKind(value: unknown): BlockKind | 'all' {
  return value === 'audio' || value === 'midi' || value === 'drum' ? value : 'all';
}

function demoPrompts(rows: BlockRow[]): string[] {
  const audio = rows.filter(row => row.kind === 'audio' && row.measurementReady);
  const midi = rows.filter(row => row.kind === 'midi');
  const drums = rows.filter(row => row.kind === 'drum');
  const prompts: string[] = [];
  if (audio.length >= 2) {
    prompts.push(`Ask: what frequencies does "${audio[1].name}" mask in "${audio[0].name}" around beat ${Math.round(audio[0].startBeat)}?`);
  }
  if (audio[0]) {
    prompts.push(`Ask: how loud is "${audio[0].name}"?`);
  }
  if (midi[0]) {
    prompts.push(`Ask: read the MIDI block "${midi[0].name}" and summarize its pitch range and density.`);
    prompts.push(`Build: duplicate "${midi[0].name}" later in the arrangement without changing its notes.`);
  }
  if (drums[0]) {
    prompts.push(`Build: move the drum block "${drums[0].name}" to the next 4-bar section without creating new music.`);
  }
  return prompts.slice(0, 4);
}

export function inspectTimelineBlocks(tree: ApcAgentTree, args: InventoryArgs = {}): AskToolResult {
  const tracks = trackMap(tree);
  const selectedIds = idSet(args.blockIds);
  const kindFilter = requestedKind(args.type);
  const minBeat = typeof args.minBeat === 'number' ? args.minBeat : null;
  const maxBeat = typeof args.maxBeat === 'number' ? args.maxBeat : null;
  const cap = Math.min(typeof args.maxResults === 'number' ? args.maxResults : MAX_RESULTS, MAX_RESULTS);
  const patternSteps = new Map<string, number>();

  for (const {data} of entriesByPrefix<{id?: string; steps?: unknown}>(tree, 'patterns/')) {
    if (typeof data.id === 'string') {
      patternSteps.set(data.id, activeStepCount(data.steps));
    }
  }

  const rows = entriesByPrefix<ClipFile>(tree, 'clips/')
    .map(({data: clip}) => {
      const track = clip.trackId ? tracks.get(clip.trackId) : undefined;
      const kind = kindForClip(clip);
      const lengthBeats = Math.max(0, num(clip.lengthBeats));
      const activeSteps = clip.patternId ? patternSteps.get(clip.patternId) ?? 0 : undefined;
      const noteCount = Array.isArray(clip.notes) ? clip.notes.length : undefined;
      const row: BlockRow = {
        id: clip.id,
        name: clip.name ?? '(unnamed)',
        kind,
        trackId: clip.trackId,
        trackName: track?.name,
        startBeat: num(clip.startBeat),
        endBeat: clipEnd(clip),
        lengthBeats,
        isLocked: clip.isLocked === true,
        trackLocked: track?.isLocked === true,
        trackFrozen: track?.isFrozen === true,
        measurementReady: kind === 'audio' && typeof clip.audioFilePath === 'string' && clip.audioFilePath.length > 0,
        audioFilePath: kind === 'audio' ? clip.audioFilePath : undefined,
        durationSeconds: clip.durationSeconds,
        noteCount,
        pitchRange: pitchRange(clip.notes),
        activeSteps,
        density: lengthBeats > 0 ? Number(((noteCount ?? activeSteps ?? 0) / lengthBeats).toFixed(2)) : 0,
      };
      return row;
    })
    .filter(row => !selectedIds || (row.id ? selectedIds.has(row.id) : false))
    .filter(row => kindFilter === 'all' || row.kind === kindFilter)
    .filter(row => minBeat === null || row.endBeat > minBeat)
    .filter(row => maxBeat === null || row.startBeat < maxBeat)
    .sort((a, b) => a.startBeat - b.startBeat || a.name.localeCompare(b.name));

  const visible = rows.slice(0, cap);
  const counts = {
    total: rows.length,
    audio: rows.filter(row => row.kind === 'audio').length,
    midi: rows.filter(row => row.kind === 'midi').length,
    drum: rows.filter(row => row.kind === 'drum').length,
    measurableAudio: rows.filter(row => row.kind === 'audio' && row.measurementReady).length,
  };
  const timeline = readJson<{sections?: unknown[]}>(tree, 'timeline.json') ?? {};

  const bars: AskReportBar[] = visible.slice(0, 16).map(row => ({
    label: `${row.name} · ${row.trackName ?? row.trackId ?? 'unassigned'}`,
    value: `${row.kind} ${row.startBeat.toFixed(1)}-${row.endBeat.toFixed(1)}`,
    level: Math.min(1, row.lengthBeats / 32),
  }));

  const report: AskReport = {
    id: 'ask-block-inventory',
    kind: 'blocks',
    title: 'Timeline blocks',
    headline: `${counts.total} blocks: ${counts.measurableAudio} measurable audio, ${counts.midi} MIDI, ${counts.drum} drum pattern.`,
    metrics: [
      {label: 'Blocks', value: String(counts.total)},
      {label: 'Audio', value: String(counts.audio), hint: `${counts.measurableAudio} file-backed clips can be measured by the engine.`},
      {label: 'MIDI', value: String(counts.midi)},
      {label: 'Drums', value: String(counts.drum)},
      {label: 'Sections', value: String(Array.isArray(timeline.sections) ? timeline.sections.length : 0)},
    ],
    bars: bars.length > 0 ? bars : undefined,
    note: 'Audio means imported or recorded file-backed clips. Drum-pattern blocks are listed separately because they are MIDI-style pattern data, not measurable source audio.',
  };

  return {
    result: {
      counts,
      truncated: rows.length > visible.length,
      blocks: visible,
      demoPrompts: demoPrompts(rows),
    },
    report,
  };
}
