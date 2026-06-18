# Playback Stability — Manual QA List

> Agent A / Phase 1.1 audit. Trace transport vs pattern-preview interactions before release.
> Last updated: 2026-06-02

## Architecture touchpoints

| Component | Role | Risk |
|-----------|------|------|
| `useDAWNativeBridge.ts` | `syncSource` gating, 200 ms upsert debounce, transport_play on Play | Stale clips after drag; double transport_play |
| `useDAWStore.ts` | `setIsPlaying`, `setPlayheadBeat`, `applyEngineTransportState` | Playhead wipe on engine 0; playAwaitingEngine handoff |
| `usePlaybackPlayheadTicker.ts` | rAF wall-clock playhead until engine catches up | Drift vs engine after BT device switch |
| `useDrumPatternTransport.ts` | Local 16-step preview loop | Preview not stopped when main transport starts |
| `refreshPlayback.ts` | Post-voice stereo heal, `ensureLinearPlayback` | Clips upserted before device heal |

## Manual QA checklist

### Transport (main timeline)

- [ ] **Play from zero** — playhead advances; engine `isPlaying:true` within ~200 ms.
- [ ] **Play after voice record** — output stays stereo (not BT HFP); playback audible without toolbar Refresh.
- [ ] **Pause mid-clip** — playhead freezes; engine stops; resume continues from paused position.
- [ ] **Scrub while paused** — playhead moves; `playheadOwnedByUser` prevents engine overwrite until Play.
- [ ] **Scrub while playing** — `pauseIfPlaying` stops transport; playhead lands on scrub target.
- [ ] **BPM change while playing** — tempo updates; playhead beat/seconds stay coherent.
- [ ] **Return to zero** — playhead at 0; no stale engine position flash.

### Pattern preview vs transport

- [ ] **Drum preview alone** — 16-step loop runs; `currentStep` highlights; main transport idle.
- [ ] **Start main transport during preview** — bridge sends `stop_pattern_preview`; preview UI stops.
- [ ] **Edit steps during preview** — `update_pattern_preview` fires; audible pattern updates.
- [ ] **Unmount drum panel during preview** — cleanup sends `stop_pattern_preview`.

### Clip sync (200 ms debounce)

- [ ] **Drag clip** — native upsert within ~200 ms of release; no duplicate clips.
- [ ] **Resize clip** — same; drum clips snap to step grid.
- [ ] **Live recording** — growing clip excluded from debounced upsert; finalize upserts immediately.
- [ ] **Delete clip** — `delete_clip` immediate; empty track auto-removed.

### Undo / redo (Zustand history)

- [ ] **Move clip → Undo** — position restored; native re-sync via `refreshPlaybackAndInstruments`.
- [ ] **Pattern edit → Undo** — step toggles revert; drum lanes re-upserted.
- [ ] **Add track → Undo** — track and default pattern block removed.
- [ ] **BPM change → Undo** — tempo restored.

## Known intentional behaviors

1. **Transport loop disabled** — `set_loop_range` with `looping: false` on every sync (linear playback).
2. **Engine syncSource gate** — engine transport ticks ignored unless recording grows a clip.
3. **playAwaitingEngine** — UI rAF drives playhead until engine position > start + 0.2 s.

## Open issues / file when found

| ID | Symptom | Steps | Severity |
|----|---------|-------|----------|
| — | _none logged yet_ | | |
