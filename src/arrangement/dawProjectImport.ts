import {drumSampleForTriggerNote} from '../music/sampleCatalog';
import {BEATS_PER_STEP, createEmptyPattern, setStep} from '../music/drumPatterns';
import {audioSampleRateWarning, type AudioAnalysis} from '../music/audioImport';
import {createTrackFromTemplate, type TrackTemplateId} from '../music/trackTemplates';
import {DEFAULT_TRACK_VOLUME_DB} from '../music/trackMix';
import type {DAWBlock, DAWNote, DAWTrack, TrackType} from '../store/useDAWStore';
import {normalizeSectionMarker, type SectionMarker} from '../store/projectMetadata';
import {normalizeLyricDocument} from '../store/lyrics';
import {BLOCK_COLORS} from '../ui/timelineLayout';
import {emptyProjectSnapshot} from './projectSnapshot';
import type {DawProjectAudioAnalyzer, DawProjectImportPackage, DawProjectImportResult, DawProjectImportedMedia} from './dawProjectTypes';
import {attrBoolean, attrNumber, attrString, directChild, directChildren, parseXml} from './dawProjectXml';

type ExtensionTrack = {dawTrackId?: string; type?: TrackType; color?: string};
type ExtensionData = {tracks: ExtensionTrack[]; sections: unknown[]; lyrics?: unknown};
type ImportTrack = {dawId: string; local: DAWTrack; color: string};

function parseExtension(raw: string | undefined): ExtensionData {
  if (!raw) {
    return {tracks: [], sections: []};
  }
  try {
    const parsed = JSON.parse(raw) as {tracks?: ExtensionTrack[]; sections?: unknown[]; lyrics?: unknown};
    return {
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
      lyrics: parsed.lyrics,
    };
  } catch {
    return {tracks: [], sections: []};
  }
}

function linearToDb(value: number): number {
  return value > 0 ? 20 * Math.log10(value) : DEFAULT_TRACK_VOLUME_DB;
}

function normalizedPanToBipolar(value: number): number {
  return Math.max(-1, Math.min(1, value * 2 - 1));
}

function supportedTrackType(value: unknown): TrackType | null {
  return value === 'voice_audio' || value === 'software_instrument' || value === 'drum_machine'
    ? value
    : null;
}

function extensionForTrack(extension: ExtensionData, dawId: string): ExtensionTrack | undefined {
  return extension.tracks.find(track => track.dawTrackId === dawId);
}

function contentTrackTemplate(contentType: string, extensionType: TrackType | null): TrackTemplateId {
  if (contentType.includes('audio')) {
    return 'voice_audio';
  }
  return extensionType === 'drum_machine' ? 'drum_machine' : 'virtual_instrument';
}

function channelValue(trackElement: Element, tagName: string, fallback: number): number {
  const channel = directChild(trackElement, 'Channel');
  return attrNumber(directChild(channel ?? trackElement, tagName), 'value', fallback);
}

function isMasterTrack(element: Element, dawId: string): boolean {
  const channel = directChild(element, 'Channel');
  return dawId === 'master-track' || attrString(element, 'role') === 'master' || attrString(channel, 'role') === 'master';
}

function importedTrack(
  element: Element,
  index: number,
  extension: ExtensionData,
): ImportTrack | null {
  const dawId = attrString(element, 'id') ?? `daw-track-${index + 1}`;
  const contentType = (attrString(element, 'contentType') ?? 'notes').toLowerCase();
  const name = attrString(element, 'name') ?? `Track ${index + 1}`;
  const ext = extensionForTrack(extension, dawId);
  const extensionType = supportedTrackType(ext?.type);
  if (isMasterTrack(element, dawId)) {
    return null;
  }
  const template = contentTrackTemplate(contentType, extensionType);
  const local = createTrackFromTemplate(template, index, {id: `import-track-${index + 1}`, name});
  const volume = channelValue(element, 'Volume', 1);
  const pan = channelValue(element, 'Pan', 0.5);
  local.volumeDb = linearToDb(volume);
  local.pan = normalizedPanToBipolar(pan);
  local.isMuted = attrBoolean(directChild(directChild(element, 'Channel') ?? element, 'Mute'), 'value');
  return {dawId, local, color: ext?.color ?? attrString(element, 'color') ?? BLOCK_COLORS[index % BLOCK_COLORS.length]};
}

function notesFromClip(clip: Element): DAWNote[] {
  return Array.from(clip.getElementsByTagName('Note')).map(note => {
    const velocity = attrNumber(note, 'vel', attrNumber(note, 'rel', 0.78));
    return {
      lengthBeats: Math.max(BEATS_PER_STEP, attrNumber(note, 'duration', BEATS_PER_STEP)),
      note: Math.max(0, Math.min(127, Math.round(attrNumber(note, 'key', 60)))),
      startBeat: Math.max(0, attrNumber(note, 'time', 0)),
      velocity: Math.max(1, Math.min(127, Math.round(velocity * 127))),
    };
  });
}

function midiBlock(clip: Element, track: ImportTrack, index: number): DAWBlock | null {
  const notes = notesFromClip(clip);
  if (notes.length === 0) {
    return null;
  }
  return {
    id: `daw-midi-${track.local.id}-${index + 1}`,
    trackId: track.local.id,
    name: attrString(clip, 'name') ?? `${track.local.name} Clip`,
    startBeat: Math.max(0, attrNumber(clip, 'time', 0)),
    lengthBeats: Math.max(1, attrNumber(clip, 'duration', 1)),
    type: 'midi',
    color: track.color,
    notes,
  };
}

function drumBlock(
  clip: Element,
  track: ImportTrack,
  index: number,
): {block: DAWBlock; patternId: string; pattern: ReturnType<typeof createEmptyPattern>} | null {
  let pattern = createEmptyPattern(attrString(clip, 'name') ?? `${track.local.name} Pattern`);
  let mappedHits = 0;
  notesFromClip(clip).forEach(note => {
    const sampleKey = drumSampleForTriggerNote(note.note);
    if (!sampleKey) {
      return;
    }
    const step = Math.round((note.startBeat % 4) / BEATS_PER_STEP);
    pattern = setStep(pattern, sampleKey, step, true);
    mappedHits += 1;
  });
  if (mappedHits === 0) {
    return null;
  }
  const lengthBeats = Math.max(1, attrNumber(clip, 'duration', 4));
  return {
    patternId: pattern.id,
    pattern,
    block: {
      id: `daw-drum-${track.local.id}-${index + 1}`,
      trackId: track.local.id,
      name: attrString(clip, 'name') ?? pattern.name,
      startBeat: Math.max(0, attrNumber(clip, 'time', 0)),
      lengthBeats,
      type: 'audio',
      color: track.color,
      patternId: pattern.id,
      sourceLengthBeats: lengthBeats,
      sourceOffsetBeats: 0,
    },
  };
}

function fallbackAnalysis(clip: Element, audio: Element | null): AudioAnalysis {
  return {
    channelCount: audio ? attrNumber(audio, 'channels', 2) : 2,
    durationSeconds: audio ? attrNumber(audio, 'duration', 0) : undefined,
    lengthBeats: Math.max(1, attrNumber(clip, 'duration', 1)),
    sampleRate: audio ? attrNumber(audio, 'sampleRate', 48000) : undefined,
  };
}

function beatFade(clip: Element, name: string): number | undefined {
  return (attrString(clip, 'fadeTimeUnit') ?? 'beats') === 'beats' ? Math.max(0, attrNumber(clip, name, 0)) : undefined;
}

function audioBlock(
  clip: Element,
  track: ImportTrack,
  index: number,
  media: Map<string, DawProjectImportedMedia>,
  analyze: DawProjectAudioAnalyzer,
  projectSampleRate?: number,
): {block: DAWBlock | null; failedAnalysis: boolean; missingMedia: boolean} | null {
  const file = Array.from(clip.getElementsByTagName('File'))[0] ?? null;
  const archivePath = attrString(file, 'path');
  const importedMedia = archivePath ? media.get(archivePath) : undefined;
  if (!importedMedia) {
    return {block: null, failedAnalysis: false, missingMedia: true};
  }
  const audio = file?.parentElement?.tagName === 'Audio' ? file.parentElement : null;
  const analyzed = analyze(importedMedia);
  const analysis = analyzed ?? fallbackAnalysis(clip, audio);
  return {
    failedAnalysis: analyzed === null,
    missingMedia: false,
    block: {
      id: `daw-audio-${track.local.id}-${index + 1}`,
      trackId: track.local.id,
      name: attrString(clip, 'name') ?? importedMedia.name,
      startBeat: Math.max(0, attrNumber(clip, 'time', 0)),
      lengthBeats: Math.max(1, attrNumber(clip, 'duration', analysis.lengthBeats ?? 1)),
      type: 'audio',
      color: track.color,
      sourceLengthBeats: analysis.lengthBeats,
      sourceOffsetBeats: Math.max(0, attrNumber(clip, 'playStart', 0)),
      audioFilePath: importedMedia.relativePath,
      absoluteAudioFilePath: importedMedia.absolutePath,
      mediaSourceName: importedMedia.name,
      waveformPeaks: analysis.waveformPeaks ?? [],
      durationSeconds: analysis.durationSeconds,
      fadeInBeats: beatFade(clip, 'fadeInTime'),
      fadeOutBeats: beatFade(clip, 'fadeOutTime'),
      sourceSampleRate: analysis.sampleRate,
      sourceChannelCount: analysis.channelCount,
      sourceFileBytes: analysis.fileBytes,
      sourcePeakAmplitude: analysis.peakAmplitude,
      mediaValidationWarning: audioSampleRateWarning(analysis.sampleRate, projectSampleRate),
    },
  };
}

function countUnsupported(project: Element): number {
  return Array.from(project.getElementsByTagName('Devices'))
    .reduce((count, element) => count + element.children.length, 0);
}

export function dawProjectSnapshotFromPackage(
  input: DawProjectImportPackage,
  analyze: DawProjectAudioAnalyzer,
  projectSampleRate?: number,
): DawProjectImportResult {
  const document = parseXml(input.projectXml);
  const project = document?.documentElement;
  if (!project || project.tagName !== 'Project') {
    return {ok: false, error: 'DAWproject is missing a valid project.xml.'};
  }
  const extension = parseExtension(input.extensionJson);
  const tracks = Array.from(project.getElementsByTagName('Track'))
    .map((track, index) => importedTrack(track, index, extension))
    .filter((track): track is ImportTrack => track !== null);
  const trackMap = new Map(tracks.map(track => [track.dawId, track]));
  const media = new Map(input.mediaFiles.map(file => [file.archivePath, file]));
  const blocks: DAWBlock[] = [];
  const patterns: Record<string, ReturnType<typeof createEmptyPattern>> = {};
  let missingMediaCount = 0;
  let failedAnalysisCount = 0;
  let skippedClipCount = 0;
  Array.from(project.getElementsByTagName('Lanes')).forEach(lane => {
    const track = trackMap.get(attrString(lane, 'track') ?? '');
    if (!track) {
      return;
    }
    const clips = directChild(lane, 'Clips');
    directChildren(clips ?? lane, 'Clip').forEach((clip, index) => {
      const mapped = clip.getElementsByTagName('File').length > 0
        ? audioBlock(clip, track, index, media, analyze, projectSampleRate)
        : track.local.type === 'drum_machine'
          ? drumBlock(clip, track, index)
          : midiBlock(clip, track, index);
      if (!mapped) {
        skippedClipCount += 1;
        return;
      }
      if ('pattern' in mapped) {
        patterns[mapped.patternId] = mapped.pattern;
        blocks.push(mapped.block);
      } else if ('block' in mapped) {
        if (mapped.block) {
          blocks.push(mapped.block);
          failedAnalysisCount += mapped.failedAnalysis ? 1 : 0;
          missingMediaCount += mapped.missingMedia ? 1 : 0;
        } else {
          missingMediaCount += 1;
          skippedClipCount += 1;
        }
      } else {
        blocks.push(mapped);
      }
    });
  });
  if (tracks.length === 0 || blocks.length === 0) {
    return {ok: false, error: 'DAWproject did not contain usable tracks or clips.'};
  }
  const transport = directChild(project, 'Transport') ?? project;
  const tempo = directChild(transport, 'Tempo');
  const signature = directChild(transport, 'TimeSignature');
  const snapshot = emptyProjectSnapshot();
  snapshot.bpm = attrNumber(tempo, 'value', snapshot.bpm);
  snapshot.timeSignature = {
    denominator: attrNumber(signature, 'denominator', snapshot.timeSignature.denominator),
    numerator: attrNumber(signature, 'numerator', snapshot.timeSignature.numerator),
  };
  snapshot.sections = extension.sections.map(normalizeSectionMarker).filter((section): section is SectionMarker => section !== null);
  snapshot.lyrics = normalizeLyricDocument(extension.lyrics);
  snapshot.tracks = tracks.map(track => track.local);
  snapshot.blocks = blocks;
  snapshot.patterns = patterns;
  return {
    ok: true,
    snapshot,
    failedAnalysisCount,
    importedClipCount: blocks.length,
    importedTrackCount: tracks.length,
    missingMediaCount,
    skippedClipCount,
    unsupportedContentCount: countUnsupported(project),
  };
}
