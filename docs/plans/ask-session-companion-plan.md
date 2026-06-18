# Ask — Read-Only Session Companion (Phase A)

> Feature plan under `docs/plans/ai-producer-core-plan.md`. Adapts the "Ask" pillar of the
> Session Companion concept (originally drafted for Ableton `.als`) to **this app's own
> session model** (the `.apc` snapshot + native C++ engine). Buildable, gated work; the
> canonical architecture/rules live in the core plan and `AGENTS.md`.

## 1. Product principles (binding for this feature)

1. **Transformation, never origination.** Ask only measures, describes, and reasons over
   material the user already made. It never proposes or applies an edit and never invents
   musical content. (Editing is the separate "Build" Copilot mode.)
2. **The model reasons over measurements; it never "listens."** Every audio claim is
   grounded in a number produced by the C++ engine (loudness, spectral balance), surfaced
   to the model as JSON via read-only tools. No JS audio analysis (AGENTS.md).
3. **Read-only by construction.** In Ask mode the agent loop is given *no* mutating tool
   (`submit_project_patch`/`answer_copilot` are withheld), so a read-only guarantee is
   structural, not just prompt-deep.
4. **Second screen.** Ask is an in-panel mode of the existing Copilot surface, reusing the
   same chat, history, and agent loop — not a new product.

## 2. Scope — Phase A (this plan)

Ask ships first and read-only. Five capabilities, exposed as agent tools:

| Tool | Kind | Source | Status |
|------|------|--------|--------|
| `get_session_summary` | session model | `.apc` tree (manifest/project/timeline/tracks/clips) | built |
| `find_clips` | session model | `.apc` tree (clips/*.json) | built |
| `analyze_arrangement_density` | session model | `.apc` tree (clips + patterns + sections) | built |
| `measure_loudness` | measurement | C++ `measure_loudness` over a clip's WAV | wired; needs native cmd |
| `analyze_masking` | measurement | C++ `get_spectrum_bands` over two clips' WAVs, band overlap | wired; needs native cmd |
| `compare_reference_low_end` | measurement | C++ `get_spectrum_bands`, loudness-matched low-band delta | wired; needs native cmd |

All comparisons are loudness-matched. Measurements operate on **audio clips' rendered
WAVs** (the app's analog of "stems"); per-track stem rendering of MIDI tracks is out of
scope for Phase A (the tool reports "measurement unavailable" rather than guessing).

Out of scope here: Diff (versioning) and Do (the edit engine) — later phases.

## 3. Architecture (how it reuses the existing Copilot)

```
CopilotPanel (Ask/Build toggle)
  └─ runCopilotAgent({mode:'ask', …})           // src/assistant — skips proposal staging in ask
       └─ window.copilot.agentAsk({mode:'ask'})  // preload IPC: copilot:agent-ask (reused)
            └─ askCopilotAgent(request, {sendNativeCommand})   // electron/copilotAgentLoop
                 ├─ ASK system prompt + ASK tools (no patch tool)   // electron/askContract
                 ├─ session-model tools                              // electron/askAnalysisTools
                 └─ measurement tools → sendNativeCommand(…)         // electron/askAudioTools
                       └─ shared_cpp: measure_loudness / get_spectrum_bands (JSON)
```

- A `mode: 'build' | 'ask'` flag threads renderer → IPC → loop. Build behaviour is
  unchanged when `mode` is absent/`'build'`.
- Read-only analysis tools return both model-facing data **and** an `AskReport` card
  payload; the loop collects reports and returns them with the text answer.
- The panel renders reports as read-only `AskReportCard`s and never touches the staging
  store in ask mode.

## 4. Constraints honoured

- **No audio in JS** — all DSP in `shared_cpp`; JS only sends/receives JSON
  (`noJsAudioGuardrail.test.ts`). New loudness/spectrum math is pure C++17.
- **Files < 300 lines** — Ask logic lives in new sibling modules, not bolted onto the
  282-line `copilotAgentLoop.ts`.
- **`electron/` cannot import `src/`** — the `AskReport` and `CopilotMode` shapes are
  mirrored on both sides.

## 5. Verification

- `npm test` — pure tool unit tests, DI-mocked loop test (ask omits the patch tool;
  reports flow through), component test for the toggle + cards.
- `npm run lint`, `npm run build:electron` (tsc).
- `npm run smoke:native-loudness` / `smoke:native-spectrum-bands` — real C++ DSP output
  once the native commands land.

## 6. Phase A gate

A user reaches one grounded "aha" answer about their own session in the first session
(e.g. "what's the loudest track / what's masking the vocal"), measured, with no edit risk.
