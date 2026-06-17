import {isDrumPatternBlock} from '../music/clipFactories';
import {normalizeDrumPattern, type DrumPattern} from '../music/drumPatterns';
import type {DAWBlock, DAWNote, DAWTrack, TrackType} from '../store/useDAWStore';

export type ClipClipboardForm =
  | 'software_instrument_midi'
  | 'drum_machine_pattern'
  | 'voice_audio_clip';

export type ClipClipboardItem = {
  form: ClipClipboardForm;
  block: DAWBlock;
  pattern: DrumPattern | null;
  startOffsetBeats: number;
  trackOffset: number;
};

export type ClipClipboardPayload = {
  form: ClipClipboardForm;
  block: DAWBlock;
  pattern: DrumPattern | null;
  items: ClipClipboardItem[];
  anchorTrackOffset: number;
};

export function cloneNotes(notes: DAWNote[] | undefined): DAWNote[] | undefined {
  return notes?.map(note => ({...note}));
}

export function cloneBlock(block: DAWBlock): DAWBlock {
  return {
    ...block,
    notes: cloneNotes(block.notes),
    waveformPeaks: block.waveformPeaks ? [...block.waveformPeaks] : undefined,
  };
}

export function clonePattern(pattern: DrumPattern): DrumPattern {
  return normalizeDrumPattern({
    ...pattern,
    steps: Object.fromEntries(
      Object.entries(pattern.steps).map(([key, row]) => [key, [...row]]),
    ) as DrumPattern['steps'],
  });
}

/** Clipboard stores metadata only; C++ keeps owning any audio file decoding/playback. */
export function getClipForm(
  block: DAWBlock,
  track: DAWTrack,
): ClipClipboardForm | null {
  if (block.type === 'midi' && track.type === 'software_instrument') {
    return 'software_instrument_midi';
  }
  if (isDrumPatternBlock(block) && track.type === 'drum_machine') {
    return 'drum_machine_pattern';
  }
  if (block.type === 'audio' && !isDrumPatternBlock(block) && track.type === 'voice_audio') {
    return 'voice_audio_clip';
  }
  return null;
}

export function destinationTrackTypeForForm(form: ClipClipboardForm): TrackType {
  if (form === 'software_instrument_midi') {
    return 'software_instrument';
  }
  if (form === 'drum_machine_pattern') {
    return 'drum_machine';
  }
  return 'voice_audio';
}

export function clipboardItemForBlock(
  block: DAWBlock,
  track: DAWTrack,
  patterns: Record<string, DrumPattern>,
  selectionStartBeat: number,
  selectionStartTrackIndex: number,
  sourceTrackIndex: number,
): ClipClipboardItem | null {
  const form = getClipForm(block, track);
  if (!form) {
    return null;
  }

  const pattern =
    form === 'drum_machine_pattern' && block.patternId
      ? patterns[block.patternId]
      : null;

  if (form === 'drum_machine_pattern' && !pattern) {
    return null;
  }

  return {
    form,
    block: cloneBlock(block),
    pattern: pattern ? clonePattern(pattern) : null,
    startOffsetBeats: block.startBeat - selectionStartBeat,
    trackOffset: sourceTrackIndex - selectionStartTrackIndex,
  };
}
