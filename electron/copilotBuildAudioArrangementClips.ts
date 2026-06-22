import {
  finiteNumber,
  roundBeat,
  slug,
  sortedJson,
  type ClipFile,
  type SectionSpec,
  type SourceClip,
} from './copilotBuildAudioArrangementSource';

type AudioSliceSpec = {
  name: string;
  startBeat: number;
  endBeat: number;
  clipGainDb: number;
  gainChanged: boolean;
};

function normalizedLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function shouldThinClip(clip: SourceClip): boolean {
  const label = normalizedLabel(`${clip.name} ${clip.trackName}`);
  return !/\b(drums?|kick|snare|hat|perc|bass|808|sub|low)\b/.test(label);
}

function uniqueClipId(base: string, used: Set<string>): string {
  let id = base.slice(0, 78);
  let suffix = 2;
  while (used.has(id)) {
    id = `${base.slice(0, 72)}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function clipForSection(
  source: SourceClip,
  section: SectionSpec,
  usedIds: Set<string>,
  targetTrackId: string,
): {id: string; content: string} | null {
  const sourceEnd = source.startBeat + source.lengthBeats;
  const startBeat = Math.max(source.startBeat, section.startBeat);
  const endBeat = Math.min(sourceEnd, section.endBeat);
  const sourceDelta = startBeat - source.startBeat;
  const available = source.sourceLengthBeats - source.sourceOffsetBeats - sourceDelta;
  const lengthBeats = roundBeat(Math.min(endBeat - startBeat, available));
  if (lengthBeats <= 0) {
    return null;
  }
  const id = uniqueClipId(`build-${section.key}-${slug(source.id)}`, usedIds);
  const clip: ClipFile = {
    ...source.clip,
    id,
    name: `${section.name} - ${source.name}`,
    trackId: targetTrackId,
    startBeat: roundBeat(startBeat),
    lengthBeats,
    sourceOffsetBeats: roundBeat(source.sourceOffsetBeats + sourceDelta),
    sourceLengthBeats: source.sourceLengthBeats,
    isMuted: false,
  };
  return {id, content: sortedJson(clip)};
}

function sliceSpecForSection(
  source: SourceClip,
  section: SectionSpec,
  dropout: {startBeat: number; endBeat: number},
  muteDropout: boolean,
): AudioSliceSpec | null {
  const sourceEnd = source.startBeat + source.lengthBeats;
  const startBeat = Math.max(source.startBeat, section.startBeat);
  const endBeat = Math.min(sourceEnd, section.endBeat);
  if (endBeat <= startBeat) {
    return null;
  }
  const currentGain = finiteNumber(source.clip.clipGainDb) ?? 0;
  const inDropout = startBeat >= dropout.startBeat && endBeat <= dropout.endBeat;
  const gainChanged = inDropout && shouldThinClip(source);
  return {
    name: section.name,
    startBeat,
    endBeat,
    clipGainDb: gainChanged
      ? Math.max(-60, currentGain - (muteDropout ? 18 : 10))
      : currentGain,
    gainChanged,
  };
}

function mergeAudioSliceSpecs(specs: AudioSliceSpec[]): AudioSliceSpec[] {
  const merged: AudioSliceSpec[] = [];
  specs.forEach(spec => {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      !previous.gainChanged &&
      !spec.gainChanged &&
      Math.abs(previous.clipGainDb - spec.clipGainDb) < 0.000001 &&
      Math.abs(previous.endBeat - spec.startBeat) < 0.000001
    ) {
      previous.endBeat = spec.endBeat;
      previous.name = `${previous.name} to ${spec.name}`;
      return;
    }
    merged.push({...spec});
  });
  return merged;
}

function clipForSliceSpec(
  source: SourceClip,
  spec: AudioSliceSpec,
  usedIds: Set<string>,
  targetTrackId: string,
): {id: string; content: string} | null {
  const sourceDelta = spec.startBeat - source.startBeat;
  const available = source.sourceLengthBeats - source.sourceOffsetBeats - sourceDelta;
  const lengthBeats = roundBeat(Math.min(spec.endBeat - spec.startBeat, available));
  if (lengthBeats <= 0) {
    return null;
  }
  const id = uniqueClipId(`build-${slug(spec.name)}-${slug(source.id)}`, usedIds);
  const clip: ClipFile = {
    ...source.clip,
    id,
    name: `${spec.name} - ${source.name}`,
    trackId: targetTrackId,
    startBeat: roundBeat(spec.startBeat),
    lengthBeats,
    sourceOffsetBeats: roundBeat(source.sourceOffsetBeats + sourceDelta),
    sourceLengthBeats: source.sourceLengthBeats,
    isMuted: false,
  };
  if (spec.gainChanged) {
    clip.clipGainDb = spec.clipGainDb;
  }
  return {id, content: sortedJson(clip)};
}

export function clipsForSections(
  source: SourceClip,
  sections: SectionSpec[],
  usedIds: Set<string>,
  targetTrackId: string,
  dropout: {startBeat: number; endBeat: number} | null,
  muteDropout: boolean,
): Array<{id: string; content: string}> {
  if (!dropout) {
    return sections
      .map(section => clipForSection(source, section, usedIds, targetTrackId))
      .filter((clip): clip is {id: string; content: string} => clip !== null);
  }
  return mergeAudioSliceSpecs(sections
    .map(section => sliceSpecForSection(source, section, dropout, muteDropout))
    .filter((spec): spec is AudioSliceSpec => spec !== null))
    .map(spec => clipForSliceSpec(source, spec, usedIds, targetTrackId))
    .filter((clip): clip is {id: string; content: string} => clip !== null);
}
