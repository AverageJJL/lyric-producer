import {createTrackFromTemplate} from '../src/music/trackTemplates';
import {setStep, createEmptyPattern} from '../src/music/drumPatterns';
import {emptyProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {buildDawProjectExport} from '../src/arrangement/dawProjectExport';
import {dawProjectSnapshotFromPackage} from '../src/arrangement/dawProjectImport';

const notesProjectXml = `
<Project version="1.0">
  <Transport><Tempo value="98"/><TimeSignature numerator="3" denominator="4"/></Transport>
  <Structure>
    <Track contentType="notes" id="daw-track-1" name="Keys" color="#abcdef">
      <Channel role="regular"><Mute value="false"/><Pan value="0.5"/><Volume value="1"/></Channel>
    </Track>
  </Structure>
  <Arrangement><Lanes><Lanes track="daw-track-1"><Clips>
    <Clip time="1" duration="4" name="Phrase"><Notes>
      <Note time="0.25" duration="0.5" key="60" vel="0.75"/>
    </Notes></Clip>
  </Clips></Lanes></Lanes></Arrangement>
  <Scenes/>
</Project>`;

const audioProjectXml = `
<Project version="1.0">
  <Transport><Tempo value="120"/><TimeSignature numerator="4" denominator="4"/></Transport>
  <Structure>
    <Track contentType="audio" id="audio-track" name="Vocal" color="#55aaff">
      <Channel role="regular"><Mute value="false"/><Pan value="0.5"/><Volume value="1"/></Channel>
    </Track>
  </Structure>
  <Arrangement><Lanes><Lanes track="audio-track"><Clips>
    <Clip time="2" duration="8" playStart="1" fadeInTime="0.25" fadeOutTime="0.5" fadeTimeUnit="beats" name="Take">
      <Clips><Clip time="0" duration="8"><Warps>
        <Audio channels="2" duration="3" sampleRate="48000"><File path="audio/take.wav"/></Audio>
      </Warps></Clip></Clips>
    </Clip>
  </Clips></Lanes></Lanes></Arrangement>
  <Scenes/>
</Project>`;

describe('DAWproject import mapper', () => {
  it('imports note clips as an unsaved MIDI arrangement snapshot', () => {
    const imported = dawProjectSnapshotFromPackage({
      mediaFiles: [],
      projectXml: notesProjectXml,
    }, () => null);

    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.snapshot.bpm).toBe(98);
    expect(imported.snapshot.timeSignature).toEqual({numerator: 3, denominator: 4});
    expect(imported.snapshot.tracks[0]?.type).toBe('software_instrument');
    expect(imported.snapshot.blocks[0]).toMatchObject({
      name: 'Phrase',
      startBeat: 1,
      type: 'midi',
    });
    expect(imported.snapshot.blocks[0]?.notes?.[0]).toMatchObject({
      note: 60,
      startBeat: 0.25,
      velocity: 95,
    });
  });

  it('imports embedded audio media into playable audio blocks', () => {
    const imported = dawProjectSnapshotFromPackage({
      mediaFiles: [{
        archivePath: 'audio/take.wav',
        absolutePath: '/tmp/imports/take.wav',
        relativePath: 'imports/take.wav',
        name: 'take',
      }],
      projectXml: audioProjectXml,
    }, () => ({
      durationSeconds: 3,
      fileBytes: 1200,
      lengthBeats: 8,
      sampleRate: 48000,
      channelCount: 2,
      waveformPeaks: [0.2, 0.4],
    }), 48000);

    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.snapshot.tracks[0]?.type).toBe('voice_audio');
    expect(imported.snapshot.blocks[0]).toMatchObject({
      absoluteAudioFilePath: '/tmp/imports/take.wav',
      audioFilePath: 'imports/take.wav',
      sourceOffsetBeats: 1,
      fadeInBeats: 0.25,
      fadeOutBeats: 0.5,
      type: 'audio',
      waveformPeaks: [0.2, 0.4],
    });
  });

  it('imports regular hybrid audio-notes tracks instead of treating them as master', () => {
    const xml = notesProjectXml.replace('contentType="notes"', 'contentType="audio notes"');
    const imported = dawProjectSnapshotFromPackage({mediaFiles: [], projectXml: xml}, () => null);

    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.snapshot.tracks[0]?.name).toBe('Keys');
    expect(imported.snapshot.blocks[0]?.name).toBe('Phrase');
  });

  it('re-imports exported app drum tracks through the extension metadata', () => {
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

    const imported = dawProjectSnapshotFromPackage({
      extensionJson: exported.extensionJson,
      mediaFiles: [],
      projectXml: exported.projectXml,
    }, () => null);

    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.snapshot.tracks[0]?.type).toBe('drum_machine');
    expect(Object.values(imported.snapshot.patterns)[0]?.steps.kick[0]).toBe(true);
  });

  it('counts unsupported device content without crashing import', () => {
    const xml = notesProjectXml.replace(
      '<Channel role="regular">',
      '<Channel role="regular"><Devices><Vst3Plugin id="plugin-a"/></Devices>',
    );
    const imported = dawProjectSnapshotFromPackage({mediaFiles: [], projectXml: xml}, () => null);

    expect(imported.ok).toBe(true);
    expect(imported.ok && imported.unsupportedContentCount).toBe(1);
  });
});
