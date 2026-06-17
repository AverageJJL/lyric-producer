import {sanitizeCopilotAnswer} from '../src/assistant/copilotActions';

const EMPTY_DRUMS = {drumPatternOptions: [], drumPatternEdits: []};

describe('copilot action validation', () => {
  it('keeps valid UI guidance actions', () => {
    expect(sanitizeCopilotAnswer({
      text: 'Use + Add track.',
      actions: [
        {type: 'show_ui_guide', targetId: 'add-track-button'},
        {type: 'reveal_ui_target', targetId: 'track-details'},
        {type: 'focus_ui_target', targetId: 'visible:button:freeze-pop-basic'},
        {type: 'open_right_panel', panel: 'audio'},
        {type: 'set_mixer_open', open: true},
      ],
    }, {validTargetIds: ['visible:button:freeze-pop-basic']})).toEqual({
      text: 'Use + Add track.',
      actions: [
        {type: 'show_ui_guide', targetId: 'add-track-button'},
        {type: 'reveal_ui_target', targetId: 'track-details'},
        {type: 'focus_ui_target', targetId: 'visible:button:freeze-pop-basic'},
        {type: 'open_right_panel', panel: 'audio'},
        {type: 'set_mixer_open', open: true},
      ],
      midiBlockEdits: [],
      midiOptions: [],
      ...EMPTY_DRUMS,
    });
  });

  it('only allows workflow-only targets for reveal actions', () => {
    expect(sanitizeCopilotAnswer({
      text: 'Open the volume control.',
      actions: [
        {type: 'show_ui_guide', targetId: 'track:track-1:volume'},
        {type: 'focus_ui_target', targetId: 'track:track-1:volume'},
        {type: 'reveal_ui_target', targetId: 'track:track-1:volume'},
      ],
    }, {
      visibleTargetIds: ['add-track-button'],
      revealTargetIds: ['track:track-1:volume'],
    })).toEqual({
      text: 'Open the volume control.',
      actions: [{type: 'reveal_ui_target', targetId: 'track:track-1:volume'}],
      midiBlockEdits: [],
      midiOptions: [],
      ...EMPTY_DRUMS,
    });
  });

  it('drops unknown actions and targets', () => {
    expect(sanitizeCopilotAnswer({
      text: 'I can answer that.',
      actions: [
        {type: 'show_ui_guide', targetId: 'made-up-target'},
        {type: 'reveal_ui_target', targetId: 'unknown-target'},
        {type: 'focus_ui_target', targetId: 'unknown-target'},
        {type: 'open_right_panel', panel: 'copilot'},
        {type: 'delete_track', trackId: 'track-1'},
      ],
    })).toEqual({
      text: 'I can answer that.',
      actions: [],
      midiBlockEdits: [],
      midiOptions: [],
      ...EMPTY_DRUMS,
    });
  });

  it('keeps whole MIDI block edits but drops note patch operations', () => {
    expect(sanitizeCopilotAnswer({
      text: 'I prepared a block.',
      actions: [],
      midiBlockEdits: [
        {
          op: 'upsertMidiBlock',
          id: 'clip-1',
          trackId: 'track-1',
          name: 'Lead',
          startBeat: 0,
          lengthBeats: 4,
          notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
        },
        {op: 'addMidiNote', blockId: 'clip-1', note: 62},
      ],
    })).toEqual({
      text: 'I prepared a block.',
      actions: [],
      midiBlockEdits: [{
        op: 'upsertMidiBlock',
        id: 'clip-1',
        trackId: 'track-1',
        name: 'Lead',
        startBeat: 0,
        lengthBeats: 4,
        notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
      }],
      midiOptions: [],
      ...EMPTY_DRUMS,
    });
  });

  it('keeps MIDI option cards and clamps bass notes into playable range', () => {
    const answer = sanitizeCopilotAnswer({
      text: 'Try these basslines.',
      actions: [{type: 'addTrack'}],
      midiOptions: [{
        id: 'bass-a',
        label: 'Low Push',
        role: 'bassline',
        description: 'Root movement.',
        startBeat: 0,
        lengthBeats: 4,
        target: {instrumentId: 'bass_growly', presetId: 'growly_bass_lite', label: 'Electric Bass'},
        notes: [
          {note: 29, velocity: 90, startBeat: 0, lengthBeats: 1},
          {note: 31, velocity: 90, startBeat: 1, lengthBeats: 1},
        ],
      }],
    });

    expect(answer.actions).toEqual([]);
    expect(answer.midiOptions).toHaveLength(1);
    expect(answer.midiOptions[0]?.notes.map(note => note.note)).toEqual([33, 33]);
  });

  it('strips harmless extra fields from pending MIDI edit responses', () => {
    expect(sanitizeCopilotAnswer({
      text: 'I prepared a block.',
      actions: [],
      midiBlockEdits: [{
        op: 'upsertMidiBlock',
        trackId: 'track-1',
        name: 'Lead',
        startBeat: 0,
        lengthBeats: 4,
        mood: 'romantic',
        notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
      }],
    }).midiBlockEdits).toEqual([{
      op: 'upsertMidiBlock',
      trackId: 'track-1',
      name: 'Lead',
      startBeat: 0,
      lengthBeats: 4,
      notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
    }]);
  });
});
