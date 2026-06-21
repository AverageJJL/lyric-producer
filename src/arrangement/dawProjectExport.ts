import {DRUM_SAMPLE_KEYS} from '../assets/drumKit';
import {BEATS_PER_STEP, normalizeDrumPattern} from '../music/drumPatterns';
import {triggerNoteForDrumSample} from '../music/sampleCatalog';
import type {DAWBlock, DAWNote, DAWTrack} from '../store/useDAWStore';
import type {ProjectSnapshot} from './projectSnapshot';
import type {DawProjectExportPackage, DawProjectMediaExport} from './dawProjectTypes';
import {xmlElement, xmlEscape} from './dawProjectXml';

const APP_NAME = 'AI Producer Core';

function formatNumber(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(6)).toString() : '0';
}

function dbToLinear(db: number | undefined): number {
  return Math.pow(10, (db ?? 0) / 20);
}

function panToNormalized(pan: number | undefined): number {
  return Math.max(0, Math.min(1, ((pan ?? 0) + 1) / 2));
}

function safeArchiveName(name: string, fallback: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim();
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
}

function trackContentType(track: DAWTrack): string {
  return track.type === 'voice_audio' ? 'audio' : 'notes';
}

function colorForTrack(snapshot: ProjectSnapshot, track: DAWTrack): string {
  return snapshot.blocks.find(block => block.trackId === track.id)?.color ?? '#64a5ff';
}

function channelXml(track: DAWTrack, channelId: string, role = 'regular'): string {
  return xmlElement('Channel', {
    audioChannels: 2,
    id: channelId,
    role,
    solo: track.isSolo === true,
  }, [
    xmlElement('Mute', {id: `${channelId}-mute`, name: 'Mute', value: track.isMuted === true}),
    xmlElement('Pan', {
      id: `${channelId}-pan`,
      max: 1,
      min: 0,
      name: 'Pan',
      unit: 'normalized',
      value: formatNumber(panToNormalized(track.pan)),
    }),
    xmlElement('Volume', {
      id: `${channelId}-volume`,
      max: 2,
      min: 0,
      name: 'Volume',
      unit: 'linear',
      value: formatNumber(dbToLinear(track.volumeDb)),
    }),
  ].join(''));
}

function tracksXml(snapshot: ProjectSnapshot, trackIds: Map<string, string>): string {
  const tracks = snapshot.tracks.map((track, index) => {
    const id = trackIds.get(track.id)!;
    return xmlElement('Track', {
      color: colorForTrack(snapshot, track),
      contentType: trackContentType(track),
      id,
      loaded: true,
      name: track.name,
    }, channelXml(track, `channel-${index + 1}`));
  });
  tracks.push(xmlElement('Track', {
    contentType: 'audio notes',
    id: 'master-track',
    loaded: true,
    name: 'Master',
  }, channelXml({
    id: 'master',
    name: 'Master',
    isMuted: false,
    isSolo: false,
    type: 'voice_audio',
    instrumentId: 'voice_audio',
    presetId: 'voice_audio',
    isRecordArmed: false,
    isLocked: false,
  }, 'master-channel', 'master')));
  return xmlElement('Structure', {}, tracks.join(''));
}

function noteXml(note: DAWNote, offsetBeat = 0): string {
  return xmlElement('Note', {
    channel: 0,
    duration: formatNumber(note.lengthBeats),
    key: Math.max(0, Math.min(127, Math.round(note.note))),
    rel: formatNumber(Math.max(0, Math.min(1, note.velocity / 127))),
    time: formatNumber(note.startBeat + offsetBeat),
    vel: formatNumber(Math.max(0, Math.min(1, note.velocity / 127))),
  });
}

function midiClipXml(block: DAWBlock, clipId: string): string {
  return xmlElement('Clip', {
    duration: formatNumber(block.lengthBeats),
    name: block.name,
    playStart: 0,
    time: formatNumber(block.startBeat),
  }, xmlElement('Notes', {id: `${clipId}-notes`}, (block.notes ?? []).map(note => noteXml(note)).join('')));
}

function drumNotes(block: DAWBlock, snapshot: ProjectSnapshot): DAWNote[] {
  const pattern = block.patternId ? snapshot.patterns[block.patternId] : undefined;
  if (!pattern) {
    return [];
  }
  const normalized = normalizeDrumPattern(pattern);
  const bars = Math.max(1, Math.ceil(block.lengthBeats / 4));
  return DRUM_SAMPLE_KEYS.flatMap(sampleKey =>
    normalized.steps[sampleKey].flatMap((active, step) => {
      if (!active) {
        return [];
      }
      return Array.from({length: bars}, (_, bar): DAWNote => ({
        note: triggerNoteForDrumSample(sampleKey),
        velocity: 100,
        startBeat: bar * 4 + step * BEATS_PER_STEP,
        lengthBeats: BEATS_PER_STEP,
      })).filter(note => note.startBeat < block.lengthBeats);
    }),
  );
}

function audioClipXml(block: DAWBlock, archivePath: string, clipId: string): string {
  const durationSeconds = block.durationSeconds ?? block.lengthBeats * 0.5;
  const audio = xmlElement('Audio', {
    channels: block.sourceChannelCount ?? 2,
    duration: formatNumber(durationSeconds),
    id: `${clipId}-audio`,
    sampleRate: block.sourceSampleRate ?? 48000,
  }, xmlElement('File', {path: archivePath}));
  return xmlElement('Clip', {
    duration: formatNumber(block.lengthBeats),
    fadeInTime: formatNumber(block.fadeInBeats ?? 0),
    fadeOutTime: formatNumber(block.fadeOutBeats ?? 0),
    fadeTimeUnit: 'beats',
    name: block.name,
    playStart: formatNumber(block.sourceOffsetBeats ?? 0),
    time: formatNumber(block.startBeat),
  }, xmlElement('Clips', {id: `${clipId}-events`}, xmlElement('Clip', {
    contentTimeUnit: 'beats',
    duration: formatNumber(block.lengthBeats),
    playStart: formatNumber(block.sourceOffsetBeats ?? 0),
    time: 0,
  }, xmlElement('Warps', {
    contentTimeUnit: 'seconds',
    id: `${clipId}-warps`,
    timeUnit: 'beats',
  }, [
    audio,
    xmlElement('Warp', {contentTime: 0, time: 0}),
    xmlElement('Warp', {contentTime: formatNumber(durationSeconds), time: formatNumber(block.lengthBeats)}),
  ].join('')))));
}

function mediaPathFor(
  block: DAWBlock,
  mediaBySource: Map<string, DawProjectMediaExport>,
): string | null {
  if (block.isMissingMedia || !block.absoluteAudioFilePath) {
    return null;
  }
  const existing = mediaBySource.get(block.absoluteAudioFilePath);
  if (existing) {
    return existing.archivePath;
  }
  const ext = block.absoluteAudioFilePath.split('.').pop() || 'wav';
  const base = safeArchiveName(block.mediaSourceName ?? block.name, 'audio');
  const archivePath = `audio/${mediaBySource.size + 1}-${base}.${ext}`;
  mediaBySource.set(block.absoluteAudioFilePath, {
    archivePath,
    sourcePath: block.absoluteAudioFilePath,
  });
  return archivePath;
}

function laneXml(
  track: DAWTrack,
  snapshot: ProjectSnapshot,
  trackId: string,
  mediaBySource: Map<string, DawProjectMediaExport>,
): {xml: string; skipped: number} {
  let skipped = 0;
  const clips = snapshot.blocks
    .filter(block => block.trackId === track.id)
    .map((block, index) => {
      const clipId = `${trackId}-clip-${index + 1}`;
      if (block.type === 'midi') {
        return midiClipXml(block, clipId);
      }
      if (block.patternId) {
        return midiClipXml({...block, notes: drumNotes(block, snapshot)}, clipId);
      }
      const archivePath = mediaPathFor(block, mediaBySource);
      if (!archivePath) {
        skipped += 1;
        return '';
      }
      return audioClipXml(block, archivePath, clipId);
    })
    .filter(Boolean)
    .join('');
  return {
    skipped,
    xml: xmlElement('Lanes', {id: `${trackId}-lane`, track: trackId},
      xmlElement('Clips', {id: `${trackId}-clips`}, clips)),
  };
}

function extensionJson(snapshot: ProjectSnapshot, trackIds: Map<string, string>): string {
  return JSON.stringify({
    app: APP_NAME,
    version: 1,
    tracks: snapshot.tracks.map(track => ({
      color: colorForTrack(snapshot, track),
      dawTrackId: trackIds.get(track.id),
      sourceTrackId: track.id,
      type: track.type,
    })),
    sections: snapshot.sections,
    lyrics: snapshot.lyrics,
  }, null, 2);
}

export function buildDawProjectExport(snapshot: ProjectSnapshot): DawProjectExportPackage {
  const trackIds = new Map(snapshot.tracks.map((track, index) => [track.id, `track-${index + 1}`]));
  const mediaBySource = new Map<string, DawProjectMediaExport>();
  let skippedMediaCount = 0;
  const lanes = snapshot.tracks.map(track => {
    const result = laneXml(track, snapshot, trackIds.get(track.id)!, mediaBySource);
    skippedMediaCount += result.skipped;
    return result.xml;
  });
  const transport = xmlElement('Transport', {}, [
    xmlElement('Tempo', {id: 'tempo-1', max: 300, min: 20, name: 'Tempo', unit: 'bpm', value: formatNumber(snapshot.bpm)}),
    xmlElement('TimeSignature', {
      denominator: snapshot.timeSignature.denominator,
      id: 'signature-1',
      numerator: snapshot.timeSignature.numerator,
    }),
  ].join(''));
  const projectXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Project version="1.0">${xmlElement('Application', {name: APP_NAME, version: '0.0.1'})}`,
    transport,
    tracksXml(snapshot, trackIds),
    xmlElement('Arrangement', {id: 'arrangement-1'},
      xmlElement('Lanes', {id: 'arrangement-lanes', timeUnit: 'beats'}, lanes.join(''))),
    '<Scenes/></Project>',
  ].join('');
  return {
    projectXml,
    metadataXml: `<?xml version="1.0" encoding="UTF-8"?><MetaData version="1.0"><Title>${xmlEscape(APP_NAME)} Export</Title></MetaData>`,
    extensionJson: extensionJson(snapshot, trackIds),
    mediaFiles: [...mediaBySource.values()],
    skippedMediaCount,
  };
}
