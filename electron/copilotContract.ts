export const COPILOT_RESPONSE_LIMITS = {
  actions: 4,
  midiBlockEdits: 4,
  midiOptions: 3,
  drumPatternOptions: 3,
  drumPatternEdits: 4,
  notes: 256,
  drumLaneSteps: 16,
} as const;

export const COPILOT_ACTION_TYPES = [
  'show_ui_guide',
  'reveal_ui_target',
  'focus_ui_target',
  'open_right_panel',
  'set_mixer_open',
] as const;

export const COPILOT_RIGHT_PANELS = ['samples', 'browser', 'audio'] as const;

export const COPILOT_MIDI_BLOCK_EDIT_OPS = [
  'upsertMidiBlock',
  'moveMidiBlock',
  'resizeMidiBlock',
  'renameMidiBlock',
] as const;

export const COPILOT_MIDI_OPTION_ROLES = [
  'bassline',
  'chords',
  'melody',
  'phrase',
] as const;

export const COPILOT_DRUM_SAMPLE_KEYS = [
  'kick',
  'snare',
  'hatClosed',
  'hatOpen',
  'tom1',
  'tom2',
  'perc',
  'clap',
] as const;

export const COPILOT_NOTE_KEYS = new Set(['note', 'velocity', 'startBeat', 'lengthBeats']);
export const COPILOT_MIDI_BLOCK_UPSERT_KEYS = new Set([
  'op',
  'id',
  'trackId',
  'name',
  'startBeat',
  'lengthBeats',
  'notes',
]);
export const COPILOT_MIDI_BLOCK_MOVE_KEYS = new Set(['op', 'blockId', 'startBeat', 'trackId']);
export const COPILOT_MIDI_BLOCK_RESIZE_KEYS = new Set(['op', 'blockId', 'startBeat', 'lengthBeats']);
export const COPILOT_MIDI_BLOCK_RENAME_KEYS = new Set(['op', 'blockId', 'name']);
export const COPILOT_MIDI_INTENT_KEYS = new Set(['instrumentId', 'presetId', 'label']);
export const COPILOT_MIDI_CREATE_TRACK_KEYS = new Set(['name', 'instrumentId', 'presetId']);
export const COPILOT_MIDI_OPTION_KEYS = new Set([
  'id',
  'label',
  'role',
  'description',
  'startBeat',
  'lengthBeats',
  'notes',
  'target',
  'createTrack',
]);
export const COPILOT_DRUM_LANE_KEYS = new Set(COPILOT_DRUM_SAMPLE_KEYS);
export const COPILOT_DRUM_OPTION_KEYS = new Set([
  'id',
  'label',
  'description',
  'startBeat',
  'lengthBeats',
  'kitId',
  'lanes',
]);
export const COPILOT_DRUM_EDIT_KEYS = new Set(['op', 'blockId', 'name', 'lanes']);
export const COPILOT_MIDI_OPTION_ROLE_SET = new Set<string>(COPILOT_MIDI_OPTION_ROLES);
const hasOwn = Object.prototype.hasOwnProperty;

export function hasOnlyKnownKeys(value: Record<string, unknown>, allowedKeys: ReadonlySet<string>): boolean {
  for (const key in value) {
    if (hasOwn.call(value, key) && !allowedKeys.has(key)) {
      return false;
    }
  }
  return true;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  return value;
}

function actionSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['type'],
    properties: {
      type: {type: 'string', enum: [...COPILOT_ACTION_TYPES]},
      targetId: {type: 'string'},
      panel: {type: 'string', enum: [...COPILOT_RIGHT_PANELS]},
      open: {type: 'boolean'},
    },
  };
}

function noteSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['note', 'velocity', 'startBeat', 'lengthBeats'],
    properties: {
      note: {type: 'integer', minimum: 0, maximum: 127},
      velocity: {type: 'integer', minimum: 0, maximum: 127},
      startBeat: {type: 'number', minimum: 0},
      lengthBeats: {type: 'number', exclusiveMinimum: 0},
    },
  };
}

export function drumLanesSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [...COPILOT_DRUM_SAMPLE_KEYS],
    properties: Object.fromEntries(COPILOT_DRUM_SAMPLE_KEYS.map(key => [
      key,
      {
        type: 'array',
        maxItems: COPILOT_RESPONSE_LIMITS.drumLaneSteps,
        items: {type: 'integer', minimum: 0, maximum: 15},
      },
    ])),
  };
}

export function drumPatternOptionSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'label', 'description', 'startBeat', 'lengthBeats', 'kitId', 'lanes'],
    properties: {
      id: {type: 'string'},
      label: {type: 'string'},
      description: {type: 'string'},
      startBeat: {type: 'number', minimum: 0},
      lengthBeats: {type: 'number', exclusiveMinimum: 0},
      kitId: {type: 'string'},
      lanes: drumLanesSchema(),
    },
  };
}

export function drumPatternEditSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['op', 'blockId', 'lanes'],
    properties: {
      op: {type: 'string', enum: ['replaceDrumPattern']},
      blockId: {type: 'string'},
      name: {type: 'string'},
      lanes: drumLanesSchema(),
    },
  };
}

function midiBlockEditSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['op'],
    properties: {
      op: {type: 'string', enum: [...COPILOT_MIDI_BLOCK_EDIT_OPS]},
      id: {type: 'string'},
      blockId: {type: 'string'},
      trackId: {type: 'string'},
      name: {type: 'string'},
      startBeat: {type: 'number', minimum: 0},
      lengthBeats: {type: 'number', exclusiveMinimum: 0},
      notes: {
        type: 'array',
        maxItems: COPILOT_RESPONSE_LIMITS.notes,
        items: noteSchema(),
      },
    },
  };
}

function midiOptionSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'label', 'role', 'description', 'startBeat', 'lengthBeats', 'target', 'notes'],
    properties: {
      id: {type: 'string'},
      label: {type: 'string'},
      role: {type: 'string', enum: [...COPILOT_MIDI_OPTION_ROLES]},
      description: {type: 'string'},
      startBeat: {type: 'number', minimum: 0},
      lengthBeats: {type: 'number', exclusiveMinimum: 0},
      target: {
        type: 'object',
        additionalProperties: false,
        required: ['instrumentId', 'presetId'],
        properties: {
          instrumentId: {type: 'string'},
          presetId: {type: 'string'},
          label: {type: 'string'},
        },
      },
      createTrack: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: {type: 'string'},
          instrumentId: {type: 'string'},
          presetId: {type: 'string'},
        },
      },
      notes: {
        type: 'array',
        maxItems: COPILOT_RESPONSE_LIMITS.notes,
        items: noteSchema(),
      },
    },
  };
}

const COPILOT_TOOL_SCHEMA = deepFreeze([{
  type: 'function',
  function: {
    name: 'answer_copilot',
    description: 'Answer the user, optionally request safe UI guidance actions, and optionally propose pending whole-MIDI-block edits.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'actions'],
      properties: {
        text: {type: 'string'},
        actions: {
          type: 'array',
          maxItems: COPILOT_RESPONSE_LIMITS.actions,
          items: actionSchema(),
        },
        midiBlockEdits: {
          type: 'array',
          maxItems: COPILOT_RESPONSE_LIMITS.midiBlockEdits,
          items: midiBlockEditSchema(),
        },
        midiOptions: {
          type: 'array',
          maxItems: COPILOT_RESPONSE_LIMITS.midiOptions,
          items: midiOptionSchema(),
        },
        drumPatternOptions: {
          type: 'array',
          maxItems: COPILOT_RESPONSE_LIMITS.drumPatternOptions,
          items: drumPatternOptionSchema(),
        },
        drumPatternEdits: {
          type: 'array',
          maxItems: COPILOT_RESPONSE_LIMITS.drumPatternEdits,
          items: drumPatternEditSchema(),
        },
      },
    },
  },
}]);

export function copilotToolSchema() {
  return COPILOT_TOOL_SCHEMA;
}
