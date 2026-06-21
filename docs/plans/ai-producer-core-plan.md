# AI Producer Core & Advanced Interactions — Master Plan

> **Canonical reference document.** This file holds the *durable* pieces of the AI Producer Core: product vision, non-negotiable design principles, architecture, product requirements, and command contracts. It is **not** a status tracker or task checklist — buildable, time-bound work lives in focused per-feature plans under `docs/plans/`. Treat the design principles and command contracts here as binding.

## 1. Product Vision

Transform the existing **cross-platform headless DAW core** (Electron + React DOM UI + pure C++ `shared_cpp` engine + JSON command bridge) into a **collaborative, AI-driven creative studio** (“AI Producer Core”).

**Design principles (non-negotiable):**

| Principle | Rule |
|-----------|------|
| No audio in JS | DSP, recording, playback, realtime analysis, and spectrogram rendering run in C++ (`shared_cpp`). No non-C++ audio-analysis sidecar is currently approved. |
| Deterministic execution | LLM outputs prose for humans; **execution** is validated JSON → `applyArrangementOperations()` / native commands only. |
| Orchestration as gatekeeper | AI never writes audio files directly into the timeline; it proposes structured operations the engine applies. |
| BPM/grid is local truth | The app overrides AI timing assumptions; notes normalize to project BPM and tick grid. |
| Cross-platform core | New engine logic stays in `shared_cpp`; Electron is the Windows/macOS shell. |

---

## 2. Architecture (Current & Target)

### 2.1 Layer diagram (as implemented today)

```
┌────────────────────────────────────────────────────────────────────────┐
│                 Electron + React DOM UI (TypeScript)                   │
│  TransportBar, TrackSidebar, TimelineGrid, ClipEditorDock,             │
│  StepSequencerPanel, PianoKeyboardPanel, recording controls            │
│  Zustand: useDAWStore + useDAWNativeBridge + useDAWNativeEvents        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ sendNativeAudioCommand(cmd, payload)
                                   │ NativeAudioEngineEvents (engine → UI)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│           Electron bridge (preload IPC + Node-API native addon)        │
│  electron/native → shared_cpp/AudioEngine                              │
│  Same command/event shape on Windows and macOS                         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│  shared_cpp: AudioEngine → AudioEngineController → Tracktion/JUCE      │
│  ProjectState, InstrumentCommands, ArrangementCommands,                  │
│  SampleOneShotPlayer, DrumPatternPreview, WaveformPeaks,               │
│  AudioInputCapture, FourOscPresets                                       │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Target architecture (AI layers — not built yet)

```
┌────────────────────────────────────────────────────────────────────────┐
│  AI UX: Option cards, Preserve matrix, Lock tags, Knob animations,     │
│         Take history / A-B drawer                                      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│  Orchestration (TypeScript + optional C++ helpers)                       │
│  • Payload assembly (user text, validated project snapshot, temp)      │
│  • Schema validation + octave/BPM normalization                          │
│  • LLM API handoff (prompts, context, validated non-audio payloads)    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ ArrangementOperation[] / FX JSON
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│  applyArrangementOperations()  ← already exists (JS arrangement layer)   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   ▼
│  Native JSON commands → shared_cpp engine                              │
```

### 2.3 Sidecar boundary

There is no active audio-analysis sidecar. Electron may coordinate desktop shell concerns, file dialogs, packaging, and provider requests, but audio capture, playback, realtime analysis, rendering, DSP, and project/engine JSON parsing stay in `shared_cpp`.

Any future sidecar proposal must first update this plan and `AGENTS.md` with a narrow boundary before implementation. It must not own playback, timeline mutation, DAW state, DSP, project parsing, renderer audio, or raw local audio handoff to Copilot.

### 2.4 State authority (foundational decisions)

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Undo / redo history | **Zustand-only** (UI-authoritative) | History snapshots arrangement slice in `src/store/history.ts`; undo/redo replays via existing `useDAWNativeBridge` subscriber + `refreshPlaybackAndInstruments()`. No C++ command stack. See Experiments log **E4**. |
| Project snapshot export | **UI-authoritative** (`captureProjectSnapshot`) | Defer CTracktion edit export until orchestration needs binary interchange. Snapshot includes time signature, scale/chord metadata, track lock flags, FX summaries (from `get_track_fx` contract), and section markers. |

### 2.5 Key source locations (agent file map)

| Area | Path |
|------|------|
| Active plan | `docs/plans/ai-producer-core-plan.md` |
| Producer roadmap | `docs/plans/ai-producer-roadmap.md` |
| Agent rules | `AGENTS.md` |
| Instrument expansion QA | `docs/validation/instrument-expansion-gates.md` |
| UI entry | `src/web/App.tsx` |
| Global state | `src/store/useDAWStore.ts` |
| Engine sync | `src/store/useDAWNativeBridge.ts`, `src/native/refreshPlayback.ts` |
| Arrangement API (LLM-ready) | `src/arrangement/operations.ts`, `src/arrangement/projectSnapshot.ts`, `src/store/history.ts` |
| Native JSON contracts (Day 0) | `src/native/fxContract.ts`, `src/native/spectrogramContract.ts` |
| Instrument catalog | `src/music/instruments.ts`, `src/music/sampleCatalog.ts`, `src/music/addTrackCatalog.ts` |
| Electron bridge | `electron/main.ts`, `electron/preload.ts`, `electron/native/` |
| C++ engine | `shared_cpp/AudioEngineController.cpp` (+ command helpers) |

---

## 3. Feature Specifications (Product Requirements Detail)

### 3.1 Orchestration layer — functional requirements

1. **Spectrogram pipeline:** Every AI-relevant audio input produces mel spectrogram image in C++ alongside WAV; both sent multimodal LLM.
2. **Deterministic transformation:** Prose = user-facing; execution = validated JSON only.
3. **Grid and pitch normalization:** Orchestrator maps relative AI notes to absolute project grid before `applyArrangementOperations`.

### 3.2 Instrument assignment logic

1. **Explicit override:** User text contains instrument tag → map to `instruments.ts` / `sampleCatalog.ts` ID.
2. **Contextual inference:** Vague text may use the project snapshot for spectral/layout gaps → propose instrument + preset.

### 3.3 Temperature & multi-option generation

```
[ Global Temperature Slider ]
              │
              ▼
[ User Request + Project Snapshot ] → [ LLM ] → [ 2–3 Option Cards ]
```

- Low temperature (“Balanced”): conservative variations (micro-timing, octave shifts).
- High temperature (“Creative”): exploratory variations (passing tones, syncopation, call-response).

### 3.4 Human Enhancement Engine

- **Preserve matrix** — UI toggles that constrain how far the AI may rework selected musical material:

  | Toggle | When on | When off |
  |--------|---------|----------|
  | Rhythm | Lock micro-timing / transients | Quantize |
  | Contour | Keep melodic shape | Allow reharmonization |
  | Exact notes | Lock pitches | Correct to scale/style |
  | Emotional timing | Keep velocity/phrasing dynamics | Flatten |

  Encoded in the LLM payload and enforced in post-processing normalization.
- **Asset locks** on tracks/clips/parameters.
- **Retry & take history:** Non-destructive AI option attempts now persist take metadata and mute older unlocked takes; A/B drawer in bottom layout to swap takes remains future UI depth.

### 3.5 Assisted project startup (structure / head start)

**Not in the main DAW workspace.** The old inspector “Structure” panel is removed; this capability belongs on the path into a new session.

**Target flow**

1. **Project choice:** Empty project, or **Head start** (assisted).
2. **Creative brief:** What kind of song / vibe / genre (conversational or short form), including the song-idea path that starts from an existing title, artist, or lyric seed.
3. **Sample curation:** Swipe (or pick) through curated combinations from the sample provider / catalog — user selects a small stack they like (drum, bass, melody, texture roles).
4. **Session bootstrap:** Import chosen samples via the existing native-analyzed audio import path; optionally lay down section markers from templates (Beat sketch / Full song) for linear arrangement.

**Implementation notes**

- Reuse `src/arrangement/structureStacking.ts`, `StructureStackPanel` (or a dedicated onboarding screen), and `SampleProviderPanel` import plumbing — do not duplicate audio analysis in JS.
- Song-idea startup may use Musixmatch text search/lyrics plus metadata providers for BPM/key/structure hints, plus approved credit-safe YouTube-backed Cyanite.ai reference intelligence for normalized mood, energy, valence/arousal, movement, character, instrument, voice, genre, segment curves, and authoritative BPM/key when analysis succeeds. Cyanite/YouTube credentials, local audio paths, raw provider responses, and credit-spending enqueue decisions stay in Electron main; the renderer receives only normalized JSON and must never process audio or expose provider API keys.
- Direct local audio drops onto the timeline are allowed when they reuse the same native-analyzed import path and only send placement metadata from the renderer.
- **Linear mode** after startup: section banners above timeline; draggable boundaries (existing marker lane).
- **Looper mode:** Circular paradigm for beatmakers (looper mode) — startup may offer looper-oriented templates when performance mode is looper.

### 3.6 AI plugin control & mix analysis

**Workflow**

```
[ AI timeline analysis ] → [ anomaly detection ] → [ FX JSON ] → [ animated knobs ]
```

**Target anomalies**

1. Low-mid congestion (250–500 Hz) → corrective EQ cuts on secondary tracks.
2. Frequency masking (vocal vs instruments) → sidechain compression suggestions.
3. Headroom/transient spikes (snare/perc) → bus compression/saturation suggestions.

**Amp sims:** JSON builds pedal chain + cabinet IR for guitar/bass DI tracks through native `set_amp_sim` / `get_amp_sim`; project snapshots persist the chain and restore it before the mix FX rack.

**Guardrail:** Execution schema excludes stereo width, pan, spatial imaging parameters (mono downmix LLM ingestion).

### 3.7 Authored lyrics workspace
The DAW workspace may include a right-dock Lyrics panel opened from a notebook nav
button. Authored lyrics are project metadata: editable `[Section N]` sections, line
text, optional beat timestamps, estimated line timing from section bounds, and
playback word-lighting interpolated from line timing. This does not process audio in
JS; future audio-derived alignment must be C++ or separately approved.

A user-triggered similarity check may send authored lyric text to Electron main, where
provider API keys stay hidden. It returns normalized match-risk metadata only
(`low`/`medium`/`high`/`unavailable`, candidate metadata, scores, matched user line
ids, and short user-authored overlap phrases). It is informational, not a legal
copyright judgment, and full provider lyrics must not be persisted or displayed.

## 4. Arrangement & Command Contracts (For Agents)
### 4.1 `applyArrangementOperations` (existing)

Location: `src/arrangement/operations.ts`

Callers (future orchestrator) must:

1. Validate JSON → `ArrangementOperation[]`.
2. Call `applyArrangementOperations(ops, { skipNativeRefresh?: boolean })`.
3. Unless skipped, native bridge syncs via store subscribers / `refreshPlaybackAndInstruments`.

### 4.2 `captureProjectSnapshot` (existing, extend)

Location: `src/arrangement/projectSnapshot.ts`

Extend for AI: locks, lyric-aware sections, FX summaries, time signature, musical key/scale, and song-seed analysis metadata.

### 4.3 Native commands (existing reference)

Prefer snake_case commands from the UI. Commands are implemented in `AudioEngineController`. New commands must be added there with:

- JSON payload validation
- `CommandResult` / `makeSuccess` / `makeError` pattern
- JUCE message thread dispatch (`dispatchOnMessageThread`)

### 4.4 Suggested new commands (not implemented)

| Command | Purpose |
|---------|---------|
| `render_spectrogram` | Mel PNG from WAV (**implemented**) |
| `bounce_clip_audio` | Render clip stem for AI |
| `set_track_fx` / `get_track_fx` | FX parameters |
| `set_amp_sim` / `get_amp_sim` | Guitar/bass DI pedalboard + native cabinet IR state |
| `export_project_snapshot` | Optional C++ authoritative export |

---

## 5. Build, Test & Validation

### Electron desktop (Windows/macOS)

```bash
# Dev app: builds the native addon, builds Electron main/preload,
# starts Vite on an available local port, then opens Electron there.
npm run dev

# Automated checks
npm test -- --runInBand
npm run build:electron
npm run build:engine
npm run build
npm run validate:macos
npm run validate:permissions
npm run validate:release

# Local collaboration relay for remote-room development
npm run collab:service

# Local packaged app
npm run pack
```

After C++ changes, rebuild with `npm run build:engine` or run `npm run dev`, which rebuilds the engine before opening Electron.

Manual audio gates: `docs/validation/instrument-expansion-gates.md`.

### Agent pre-merge checklist

- [ ] `npm test -- --runInBand` passes.
- [ ] `npm run build:electron` passes.
- [ ] `npm run build:engine` passes.
- [ ] `npm run validate:macos` passes after `npm run build`.
- [ ] `npm run validate:permissions` passes after `npm run build:electron`.
- [ ] `npm run validate:release` passes after `npm run build` (`-- --strict` for credentialed release CI).
- [ ] No audio processing added in JS (except analysis orchestration metadata).
- [ ] New files &lt; 300 lines or split per `AGENTS.md`.
- [ ] Feature traced to its per-feature plan, or to the requirements in §3 of this document.
- [ ] C++ changes rebuilt and smoke-tested in Electron on Windows/macOS.

---

## 6. Experiments & Product Decisions Log

| ID | Question | Options | Decision | Date |
|----|----------|---------|----------|------|
| E1 | Captured-performance sidecar | Keep vs remove current prototype | **Removed from active scope** — no audio-analysis sidecar is approved | 2026-06-17 |
| E2 | Require explicit instrument? | Force vs infer | _TBD for text-driven options_ | |
| E3 | Section blocks for beatmakers? | Linear structure vs looper-first | _TBD_ | |
| E4 | Snapshot source of truth | UI Zustand vs C++ edit export | **UI Zustand** — `captureProjectSnapshot()` + Zustand-only undo history; defer CTracktion export | 2026-06-02 |

---

## 7. Related Documents

| Document | Role |
|----------|------|
| `docs/plans/ai-producer-core-plan.md` | **Reference** — AI Producer Core architecture, requirements & command contracts |
| `docs/plans/ai-producer-roadmap.md` | Companion product roadmap for songwriter/producer workflows |
| `docs/plans/ask-session-companion-plan.md` | **Feature plan** — read-only "Ask" session companion (Phase A): measurement-grounded session Q&A |
| `AGENTS.md` | Immutable architecture rules; points agents to this reference |

Track buildable, time-bound work in focused per-feature plans under `docs/plans/`, not in this reference document.

---

*Last updated: 2026-06-08 — trimmed to durable architecture, requirements, and command contracts.*
