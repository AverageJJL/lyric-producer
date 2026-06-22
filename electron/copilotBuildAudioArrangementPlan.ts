import type {ApcAgentTree} from './copilotAgentTools';
import {
  cleanString,
  finiteNumber,
  readJson,
  roundBeat,
  slug,
  wantsDropout,
  type Section,
  type SectionSpec,
  type SourceClip,
  type TimelineFile,
} from './copilotBuildAudioArrangementSource';

const DEMO_SECTIONS = [
  {name: 'Intro', startBeat: 0, endBeat: 8},
  {name: 'Groove', startBeat: 8, endBeat: 24},
  {name: 'Breakdown', startBeat: 24, endBeat: 32},
  {name: 'Lift', startBeat: 32, endBeat: 44},
  {name: 'Outro', startBeat: 44, endBeat: 52},
];

export function explicitSections(message: string): SectionSpec[] {
  const specs: SectionSpec[] = [];
  const regex = /(?:^|[,;:\n])\s*([A-Za-z][A-Za-z0-9 /&_-]{0,32}?)\s+(?:beats?\s*)?(\d+(?:\.\d+)?)\s*(?:-|to|–|—)\s*(\d+(?:\.\d+)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(message)) !== null) {
    const name = match[1].trim().replace(/\s+/g, ' ');
    const startBeat = Number(match[2]);
    const endBeat = Number(match[3]);
    if (name && Number.isFinite(startBeat) && Number.isFinite(endBeat) && endBeat > startBeat) {
      specs.push({key: slug(name), name, startBeat, endBeat});
    }
  }
  return specs.length >= 2 ? specs.sort((a, b) => a.startBeat - b.startBeat) : [];
}

export function requestedEndBeat(message: string, clips: SourceClip[], specs: SectionSpec[]): number {
  const firstMatch = /\bfirst\s+(\d+(?:\.\d+)?)\s+beats?\b/i.exec(message);
  if (firstMatch) {
    return Number(firstMatch[1]);
  }
  const explicitEnd = Math.max(0, ...specs.map(section => section.endBeat));
  if (explicitEnd > 0) {
    return explicitEnd;
  }
  const clipEnd = Math.max(...clips.map(clip => clip.startBeat + clip.lengthBeats));
  return roundBeat(Math.max(0, clipEnd));
}

function snapBeat(value: number, grid = 4): number {
  return roundBeat(Math.max(0, Math.round(value / grid) * grid));
}

function scaledSongSections(endBeat: number): SectionSpec[] {
  const labels = ['Intro', 'Groove 1', 'Groove vocal space', 'Hook lift', 'Outro'];
  const fractions = [0, 0.16, 0.4, 0.58, 0.86, 1];
  const cuts = fractions.map((fraction, index) => {
    if (index === 0) {
      return 0;
    }
    return index === fractions.length - 1 ? roundBeat(endBeat) : snapBeat(endBeat * fraction);
  });
  return labels.map((name, index) => ({
    key: slug(name),
    name,
    startBeat: cuts[index],
    endBeat: cuts[index + 1],
  })).filter(section => section.endBeat > section.startBeat);
}

export function defaultSections(endBeat: number): SectionSpec[] {
  if (Math.abs(endBeat - 52) < 0.001) {
    return DEMO_SECTIONS.map(section => ({...section, key: slug(section.name)}));
  }
  if (endBeat >= 64) {
    return scaledSongSections(endBeat);
  }
  const labels = ['Intro', 'Main A', 'Main B', 'Outro'];
  const cuts = [0, 0.25, 0.55, 0.8, 1].map(fraction => roundBeat(endBeat * fraction));
  return labels.map((name, index) => ({
    key: slug(name),
    name,
    startBeat: cuts[index],
    endBeat: cuts[index + 1],
  })).filter(section => section.endBeat > section.startBeat);
}

export function dropoutWindow(message: string, endBeat: number): {startBeat: number; endBeat: number} | null {
  if (!wantsDropout(message)) {
    return null;
  }
  const match = /\bbetween\s+beats?\s+(\d+(?:\.\d+)?)\s+(?:and|-|to)\s+(\d+(?:\.\d+)?)/i.exec(message);
  if (match) {
    const startBeat = Number(match[1]);
    const stopBeat = Number(match[2]);
    if (Number.isFinite(startBeat) && Number.isFinite(stopBeat) && stopBeat > startBeat) {
      return {startBeat, endBeat: Math.min(endBeat, stopBeat)};
    }
  }
  if (endBeat >= 64) {
    return {startBeat: snapBeat(endBeat * 0.4), endBeat: snapBeat(endBeat * 0.58)};
  }
  return endBeat > 32 ? {startBeat: 16, endBeat: 32} : {startBeat: endBeat * 0.4, endBeat: endBeat * 0.65};
}

export function splitForDropout(sections: SectionSpec[], window: {startBeat: number; endBeat: number} | null): SectionSpec[] {
  if (!window) {
    return sections;
  }
  const split: SectionSpec[] = [];
  sections.forEach(section => {
    const cuts = [section.startBeat, section.endBeat, window.startBeat, window.endBeat]
      .filter(beat => beat >= section.startBeat && beat <= section.endBeat)
      .sort((a, b) => a - b)
      .filter((beat, index, beats) => index === 0 || Math.abs(beat - beats[index - 1]) > 0.000001);
    for (let index = 0; index < cuts.length - 1; index += 1) {
      const startBeat = cuts[index];
      const endBeat = cuts[index + 1];
      if (endBeat <= startBeat) {
        continue;
      }
      const inWindow = startBeat >= window.startBeat && endBeat <= window.endBeat;
      const didSplit = cuts.length > 2;
      const suffix = didSplit && inWindow ? ' vocal space' : didSplit ? ` ${index + 1}` : '';
      split.push({
        key: slug(`${section.name}${suffix}`),
        name: `${section.name}${suffix}`,
        startBeat,
        endBeat,
      });
    }
  });
  return split;
}

function validSections(value: unknown): Section[] {
  return Array.isArray(value)
    ? value.filter((item): item is Section => {
      const section = item as Section;
      return cleanString(section.id) !== null &&
        cleanString(section.name) !== null &&
        finiteNumber(section.startBeat) !== null &&
        finiteNumber(section.lengthBeats) !== null &&
        section.lengthBeats > 0;
    })
    : [];
}

export function sectionMarkers(tree: ApcAgentTree, specs: SectionSpec[], prefix: string): Section[] {
  const timeline = readJson<TimelineFile>(tree, 'timeline.json') ?? {};
  const kept = validSections(timeline.sections).filter(section => !section.id.startsWith(prefix));
  return [
    ...kept,
    ...specs.map((section, index) => ({
      id: `${prefix}-${index + 1}-${section.key}`,
      name: section.name,
      startBeat: section.startBeat,
      lengthBeats: roundBeat(section.endBeat - section.startBeat),
    })),
  ];
}
