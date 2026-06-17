import {setStep, createEmptyPattern} from '../src/music/drumPatterns';
import {createTrackFromTemplate} from '../src/music/trackTemplates';
import {emptyProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {buildDawProjectExport} from '../src/arrangement/dawProjectExport';

describe('DAWproject export mapper', () => {
  it('exports MIDI notes with tempo, time signature, and mix values', () => {
    const snapshot = emptyProjectSnapshot();
    const track = createTrackFromTemplate('virtual_instrument', 0, {id: 'track-midi', name: 'Lead'});
    track.volumeDb = -6;
    track.pan = -0.5;
    track.isMuted = true;
    snapshot.bpm = 132;
    snapshot.timeSignature = {numerator: 7, denominator: 8};
    snapshot.tracks = [track];
    snapshot.blocks = [{
      id: 'clip-midi',
      trackId: track.id,
      name: 'Lead Phrase',
      startBeat: 2,
      lengthBeats: 4,
      type: 'midi',
      color: '#88ccff',
      notes: [{note: 64, velocity: 96, startBeat: 0.5, lengthBeats: 1}],
    }];

    const exported = buildDawProjectExport(snapshot);

    expect(exported.projectXml).toContain('value="132"');
    expect(exported.projectXml).toContain('denominator="8"');
    expect(exported.projectXml).toContain('numerator="7"');
    expect(exported.projectXml).toContain('contentType="notes"');
    expect(exported.projectXml).toContain('Mute" value="true"');
    expect(exported.projectXml).toContain('value="0.25"');
    expect(exported.projectXml).toContain('value="0.501187"');
    expect(exported.projectXml).toContain('key="64"');
    expect(exported.projectXml).toContain('time="0.5"');
  });

  it('exports drum pattern clips as trigger-note events', () => {
    const snapshot = emptyProjectSnapshot();
    const track = createTrackFromTemplate('drum_machine', 0, {id: 'track-drums', name: 'Drums'});
    const pattern = setStep(createEmptyPattern('Beat', 'pattern-a'), 'kick', 0, true);
    snapshot.tracks = [track];
    snapshot.patterns = {[pattern.id]: pattern};
    snapshot.blocks = [{
      id: 'clip-drums',
      trackId: track.id,
      name: 'Beat',
      startBeat: 0,
      lengthBeats: 4,
      type: 'audio',
      color: '#ffcc66',
      patternId: pattern.id,
    }];

    const exported = buildDawProjectExport(snapshot);

    expect(exported.projectXml).toContain('contentType="notes"');
    expect(exported.projectXml).toContain('key="36"');
    expect(exported.extensionJson).toContain('"type": "drum_machine"');
  });

  it('exports one embedded media reference per unique audio source', () => {
    const snapshot = emptyProjectSnapshot();
    const track = createTrackFromTemplate('voice_audio', 0, {id: 'track-audio', name: 'Vocal'});
    snapshot.tracks = [track];
    snapshot.blocks = [0, 1].map(index => ({
      id: `clip-audio-${index}`,
      trackId: track.id,
      name: `Take ${index + 1}`,
      startBeat: index * 4,
      lengthBeats: 4,
      type: 'audio' as const,
      color: '#55aaff',
      absoluteAudioFilePath: '/tmp/shared.wav',
      mediaSourceName: 'Shared Take',
      sourceOffsetBeats: 1,
      fadeInBeats: 0.25,
      fadeOutBeats: 0.5,
      durationSeconds: 2,
      sourceSampleRate: 48000,
      sourceChannelCount: 2,
    }));

    const exported = buildDawProjectExport(snapshot);

    expect(exported.mediaFiles).toEqual([
      {archivePath: 'audio/1-Shared Take.wav', sourcePath: '/tmp/shared.wav'},
    ]);
    expect(exported.projectXml.match(/<File path="audio\/1-Shared Take.wav"\/>/g)).toHaveLength(2);
    expect(exported.projectXml).toContain('fadeInTime="0.25"');
    expect(exported.projectXml).toContain('playStart="1"');
  });
});
