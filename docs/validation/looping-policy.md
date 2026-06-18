# Looping Policy

> Documents how linear playback, cycle locators, local preview, and Phase 3 looper mode interact.

## Three playback contexts

### 1. Main transport (timeline)

**Policy:** Linear playback by default, optional cycle-locator looping, or circular looper containers when project performance mode is `looper`.

**Implementation:**

- `useDAWNativeBridge` and `refreshPlayback` send a `set_loop_range` payload built from `buildNativeLoopRangePayload()`.
- Linear mode with cycle disabled sends:
  ```json
  { "startBeat": 0, "lengthBeats": 4096, "looping": false }
  ```
- Linear mode with cycle enabled sends the normalized cycle locator range with `"looping": true`.
- Looper mode sends a circular container from beat `0` with `lengthBeats` equal to 4 or 8 bars in the current time signature, with `"looping": true`.

**Rationale:** AI Producer Core supports arrangement-first editing and beatmaker-style circular creation without making JavaScript process audio. The UI stores performance-mode metadata and the native bridge sends JSON loop-range control to the C++ engine.

### 2. Drum pattern local preview

**Policy:** Independent 16-step loop, isolated from main transport.

**Implementation:**

- `useDrumPatternTransport` → `start_pattern_preview` / `update_pattern_preview` / `stop_pattern_preview`.
- C++ `DrumPatternPreview` runs a local step sequencer loop.
- Main transport Play **must** stop preview first (`useDAWNativeBridge` line ~201).

**Rationale:** Step-sequencer audition should not move the timeline playhead or require arrangement playback.

### 3. Looper mode (Phase 3 foundation)

**Policy:** Project performance mode switches the transport into a fixed circular container. Supported lengths are 4 bars and 8 bars.

**Implementation:**

- `performanceMode` and `looperLengthBars` are persisted in project snapshots and arrangement history.
- `TransportLooperControl` exposes the mode toggle and 4/8 bar selector.
- AI orchestration payloads include `project.performance` so models can write wrap-safe phrases instead of linear-only edits.
- The current foundation is a transport/container mode; dedicated audio overdub layers remain a future looper expansion.

## Invariants (automated in `__tests__/loopingPolicy.test.ts`)

1. Linear mode with cycle disabled sets `looping: false` on `set_loop_range`.
2. Linear mode with cycle enabled sends the normalized cycle locator range with `looping: true`.
3. Looper mode overrides cycle locators and sends a circular 4/8 bar range from beat 0.
4. Main transport Play triggers `stop_pattern_preview` when preview may be active.
5. Pattern preview commands are never sent from transport Play handler (only stop).

## Undo / history note

Transport play/pause and playhead are **not** stored in Zustand undo history. Cycle locators and looper performance-mode settings are undoable project state; the native loop policy is re-applied on every sync.
