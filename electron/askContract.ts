/**
 * Contract for the read-only "Ask" Copilot mode (the Session Companion's first pillar).
 * Ask answers questions about the user's session grounded in deterministic measurements
 * and never changes the project. It is the SAME agent loop as Build, but seeded with this
 * system prompt and these tools — crucially, NO `submit_project_patch`/`answer_copilot`,
 * so read-only is structural, not just prompt-deep.
 *
 * Analysis tools are split by source: session-model tools read the `.apc` tree
 * (electron/askAnalysisTools.ts); measurement tools call the native C++ engine
 * (electron/askAudioTools.ts). Both return data to the model AND an AskReport card.
 */

import {READ_ONLY_NAV_TOOLS} from './copilotAgentContract';

/** Which Copilot persona/toolset the loop runs. Mirrored in src/native/copilotApi.ts. */
export type CopilotMode = 'build' | 'ask';

export const ASK_FIND_MAX_RESULTS = 40;

/** Read-only session-analysis tools, in addition to the shared list/read/grep navigation. */
const ASK_ANALYSIS_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_session_summary',
      description:
        'Overview of the whole session: track/clip/pattern counts, BPM, time signature, key, sections, and project length. Call this first to orient.',
      parameters: {type: 'object', additionalProperties: false, properties: {}},
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_clips',
      description:
        'Find clips matching a name/source substring and/or filters. Returns id, name, track, timing, type and note/step counts. Use to locate "the clip that…".',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: {type: 'string', description: 'Case-insensitive substring of clip name or media source name.'},
          trackId: {type: 'string'},
          type: {type: 'string', enum: ['midi', 'audio']},
          minBeat: {type: 'number', description: 'Only clips overlapping at/after this beat.'},
          maxBeat: {type: 'number', description: 'Only clips overlapping at/before this beat.'},
          maxResults: {type: 'integer', minimum: 1, maximum: ASK_FIND_MAX_RESULTS},
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_arrangement_density',
      description:
        'Per-track arrangement density across the project length: how much of the timeline each track fills and how busy its content is (notes / active drum steps per beat). Surfaces sparse and crowded tracks.',
      parameters: {type: 'object', additionalProperties: false, properties: {}},
    },
  },
  {
    type: 'function',
    function: {
      name: 'measure_loudness',
      description:
        'Loudness of one audio clip, measured by the engine over its rendered audio (integrated/short-term LUFS, RMS, peak). MIDI clips have no audio to measure. Returns "unavailable" if the engine cannot read the clip.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['clipId'],
        properties: {clipId: {type: 'string', description: 'An audio clip id (see find_clips / clips/*.json).'}},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_masking',
      description:
        'Loudness-matched spectral overlap between two audio clips over a frequency band and optional beat range — how much one clip masks the other per band. Use for "what is masking the vocal".',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['clipIdA', 'clipIdB'],
        properties: {
          clipIdA: {type: 'string', description: 'The clip you care about (e.g. the vocal).'},
          clipIdB: {type: 'string', description: 'The clip that may be masking it.'},
          startBeat: {type: 'number'},
          endBeat: {type: 'number'},
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_reference_low_end',
      description:
        'Loudness-matched low-end comparison between one of the user\'s audio clips and an imported reference clip: per-band energy delta below the crossover. Use for "how does my low end compare to <reference>".',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['projectClipId', 'referenceClipId'],
        properties: {
          projectClipId: {type: 'string'},
          referenceClipId: {type: 'string'},
          crossoverHz: {type: 'number', description: 'Top of the low band to compare (default 200 Hz).'},
        },
      },
    },
  },
] as const;

/** The full Ask toolset: shared navigation + the read-only analysis tools. No edit tools. */
export const ASK_AGENT_TOOLS = [...READ_ONLY_NAV_TOOLS, ...ASK_ANALYSIS_TOOLS];

/** Tool names that are Ask-specific (dispatched by executeAskTool, not executeReadOnlyTool). */
export const ASK_TOOL_NAMES = new Set(ASK_ANALYSIS_TOOLS.map(tool => tool.function.name));

export const ASK_SYSTEM_PROMPT = [
  'You are the AI Producer Core "Ask" companion — a read-only second screen for a DAW.',
  'Your job is to ANSWER QUESTIONS about the user\'s session: arrangement, mix, loudness, spectral balance, clashes, and where things are. You are precise, concise, and practical.',
  '',
  'NON-NEGOTIABLE PRINCIPLES:',
  '1) Transformation, never origination. You NEVER change the project and NEVER invent musical content (no new notes, patterns, or sounds). You have no edit tools — if the user wants a change, tell them to switch to Build mode.',
  '2) You reason over MEASUREMENTS, you do not "listen". Every claim about audio must come from a tool result (loudness/spectrum numbers). Never pretend to hear audio or guess a number you were not given.',
  '3) Be honest about gaps. If a measurement comes back "unavailable" (e.g. a MIDI clip has no audio, or the engine could not read a file), say so plainly instead of inventing values. All loudness comparisons are loudness-matched.',
  '',
  'SOURCES:',
  '- The `.apc` project tree (list/read/grep) and copilotContext describe tracks, clips, MIDI notes, drum patterns, FX, tempo, key, and sections. Times are in BEATS.',
  '- Audio measurements come only from measure_loudness / analyze_masking / compare_reference_low_end, which the engine computes over a clip\'s rendered audio. Only AUDIO clips have audio; MIDI/drum clips do not.',
  '',
  'TOOLS:',
  '- get_session_summary — orient first: counts, BPM, key, sections, length.',
  '- inspect_timeline_blocks — prove you can see the user\'s audio/MIDI/drum blocks; use it before answering natural questions like "read my audio blocks" or "what MIDI blocks do I have?" and before choosing clip IDs for measurements.',
  '- find_clips — locate clips by name/track/type/time; use the returned ids for the measurement tools.',
  '- analyze_arrangement_density — per-track fill + busyness across the song.',
  '- measure_loudness(clipId) — LUFS/RMS/peak for one audio clip.',
  '- analyze_masking(clipIdA, clipIdB) — spectral overlap; which bands of B mask A.',
  '- compare_reference_low_end(projectClipId, referenceClipId) — loudness-matched low-band delta vs a reference.',
  '- list_project_files / read_project_file / grep_project_files — inspect the raw JSON when you need exact values.',
  '',
  'HOW TO ANSWER:',
  '- Gather only the measurements you need, then FINISH with a short plain-text answer (no tool call). The tool results already render as cards beside your text, so do not repeat every number — interpret them: name the track/clip, the band (Hz) or time (beats), and the takeaway.',
  '- If the question is vague ("is my mix good?"), ask one short clarifying question or pick the most useful concrete measurement and explain what you checked.',
  '- Never claim you changed anything. You cannot.',
].join('\n');
