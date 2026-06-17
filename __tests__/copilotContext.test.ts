import {
  buildCopilotContextPayload,
  findCopilotTargetElement,
} from '../src/assistant/copilotContext';
import {buildCopilotEditableArrangementSummary} from '../src/assistant/copilotArrangementContext';
import {createEmptyPattern} from '../src/music/drumPatterns';
import type {DAWBlock, DAWTrack} from '../src/store/useDAWStore';

const originalRect = HTMLElement.prototype.getBoundingClientRect;

function project() {
  return {
    rightPanel: 'copilot',
    isMixerOpen: false,
    selectedTrackId: 'track-pop',
    selectedTrackName: 'Pop Basic',
    trackCount: 1,
    hasSelectedBlock: false,
    bpm: 120,
    isPlaying: false,
    isRecording: false,
    visibleTrackNames: ['Pop Basic'],
  };
}

describe('copilot context scanner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if ((this as HTMLElement).dataset.testHiddenRect === '1') {
        return {x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({})};
      }
      return {x: 10, y: 10, left: 10, top: 10, right: 110, bottom: 40, width: 100, height: 30, toJSON: () => ({})};
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  });

  it('captures visible controls, portal dialogs, state, and redacts paths', () => {
    document.body.innerHTML = `
      <button data-copilot-id="transport.play" aria-label="Play">Play</button>
      <button aria-label="Hidden action" style="display:none">Hidden</button>
      <div role="dialog" aria-label="Track details for Pop Basic">
        <button aria-label="Freeze Pop Basic" disabled>Frz</button>
        <select aria-label="Routing output for Pop Basic">
          <option selected>/Users/morganye/session.wav</option>
        </select>
      </div>
    `;

    const context = buildCopilotContextPayload(project());
    expect(context.schemaVersion).toBe(3);
    expect(context.arrangement).toMatchObject({softwareInstrumentTracks: [], midiBlocks: []});
    expect(context.musical).toMatchObject({bpm: 120, snapGrid: 'beat', scale: null, chord: null});
    expect(context.transport).toMatchObject({isPlaying: false, isRecording: false, performanceMode: 'linear'});
    expect(context.catalog.virtualInstruments.length).toBeGreaterThan(0);
    expect(context.catalog.virtualInstruments.flatMap(section => section.presets)[0])
      .toHaveProperty('playableRange');
    expect(context.catalog.drumMachinePresets.length).toBeGreaterThan(0);
    expect(context.catalog.sampleKits[0].samples.length).toBeGreaterThan(0);
    expect(context.workflows.map(workflow => workflow.entrypointTargetId)).toContain('track:track-pop:volume');
    expect(context.visibleTargets.map(target => target.label)).toContain('Play');
    expect(context.visibleTargets.map(target => target.label)).toContain('Track details for Pop Basic');
    expect(context.visibleTargets.map(target => target.label)).toContain('Freeze Pop Basic');
    expect(context.visibleTargets.map(target => target.label)).not.toContain('Hidden action');

    const freeze = context.visibleTargets.find(target => target.label === 'Freeze Pop Basic');
    expect(freeze).toMatchObject({disabled: true, group: 'Track details for Pop Basic'});

    const output = context.visibleTargets.find(target => target.label === 'Routing output for Pop Basic');
    expect(output?.value).toBe('[path redacted]');
    expect(findCopilotTargetElement(freeze!.id)).not.toBeNull();
  });

  it('omits elements without visible bounds', () => {
    document.body.innerHTML = '<button aria-label="Collapsed" data-test-hidden-rect="1">Collapsed</button>';
    expect(buildCopilotContextPayload(project()).visibleTargets).toEqual([]);
  });

  it('captures musical context, cycle state, track details, sections, and redacted audio metadata', () => {
    const tracks: DAWTrack[] = [{
      id: 'track-1',
      name: 'Private Piano',
      type: 'software_instrument',
      instrumentId: 'keys_piano',
      presetId: 'splendid_grand',
      isMuted: false,
      isSolo: false,
      isRecordArmed: false,
      isLocked: false,
      isFrozen: false,
      routingRole: 'track',
    }, {
      id: 'track-drums',
      name: 'Drums',
      type: 'drum_machine',
      instrumentId: 'drum_machine_pop',
      presetId: 'pop_basic',
      isMuted: false,
      isSolo: false,
      isRecordArmed: false,
      isLocked: false,
      isFrozen: false,
    }, {
      id: 'track-audio',
      name: 'Voice /Users/private/take.wav',
      type: 'voice_audio',
      instrumentId: 'voice_audio',
      presetId: 'voice_audio',
      isMuted: false,
      isSolo: false,
      isRecordArmed: true,
      isLocked: true,
      isFrozen: false,
    }];
    const blocks: DAWBlock[] = [{
      id: 'clip-midi',
      trackId: 'track-1',
      name: 'Verse Chords',
      type: 'midi',
      color: '#fff',
      startBeat: 4,
      lengthBeats: 4,
      notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
    }, {
      id: 'clip-drums',
      trackId: 'track-drums',
      name: 'Beat',
      type: 'audio',
      color: '#fff',
      startBeat: 12,
      lengthBeats: 4,
      patternId: 'pat-drums',
    }, {
      id: 'clip-audio',
      trackId: 'track-audio',
      name: '/Users/private/take.wav',
      mediaSourceName: '/Users/private/take.wav',
      type: 'audio',
      color: '#fff',
      startBeat: 8,
      lengthBeats: 4,
      audioFilePath: 'media/take.wav',
      absoluteAudioFilePath: '/Users/private/take.wav',
      waveformPeaks: [0.1, 0.2],
      spectrogramPngPath: 'spectrograms/take.png',
    }];
    const pattern = createEmptyPattern('Beat', 'pat-drums');
    pattern.steps.kick[0] = true;
    pattern.steps.snare[4] = true;
    const arrangement = buildCopilotEditableArrangementSummary({
      tracks,
      blocks,
      patterns: {'pat-drums': pattern},
      selectedTrackId: 'track-1',
      selectedBlockId: 'clip-midi',
      selectedBlockIds: ['clip-midi'],
      playheadBeat: 8,
    });
    const context = buildCopilotContextPayload(project(), arrangement, {
      musical: {
        bpm: 97,
        timeSignature: {numerator: 3, denominator: 4},
        scale: {root: 'D', mode: 'minor'},
        chord: {symbol: 'Dm9'},
        snapGrid: '1/8',
        isRelativeSnapEnabled: true,
        playheadBeat: 8,
      },
      transport: {
        isPlaying: true,
        isRecording: false,
        isCycleEnabled: true,
        cycleStartBeat: 8,
        cycleEndBeat: 16,
        performanceMode: 'looper',
        looperLengthBars: 8,
      },
      sections: [{id: 'section-1', name: 'Chorus', startBeat: 8, lengthBeats: 8}],
    });

    expect(context.musical).toMatchObject({bpm: 97, timeSignature: {numerator: 3, denominator: 4}, chord: {symbol: 'Dm9'}});
    expect(context.transport).toMatchObject({isCycleEnabled: true, cycleStartBeat: 8, cycleEndBeat: 16, performanceMode: 'looper'});
    expect(context.sections).toEqual([{id: 'section-1', name: 'Chorus', startBeat: 8, lengthBeats: 8}]);
    expect(context.arrangement.tracks[0]).toMatchObject({
      id: 'track-1',
      type: 'software_instrument',
      instrumentId: 'keys_piano',
      presetId: 'splendid_grand',
      isSelected: true,
    });
    expect(context.arrangement.audioBlocks[0]).toMatchObject({
      id: 'clip-audio',
      name: '[path redacted]',
      hasWaveformPeaks: true,
      hasSpectrogramPng: true,
      spectrogramStatus: 'available',
    });
    expect(context.arrangement.drumBlocks[0]).toMatchObject({
      id: 'clip-drums',
      type: 'audio',
      patternId: 'pat-drums',
      lanes: {kick: [0], snare: [4]},
    });
    expect(JSON.stringify(context)).not.toContain('/Users/private');
  });
});
