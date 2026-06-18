# Instrument Expansion — Validation Gates

## UX
- **+ Add track** flyout: root (Virtual Instrument, Drum Machine, Voice) → virtual submenu with Keys/Bass/Lead/Pad preset list and **‹ Back**.
- Add virtual instrument in at most two taps (Add track → preset); drum/voice in one tap from root.
- Track rows show read-only sound label (no category/instrument chips on the row).
- Virtual instrument: chosen preset audible from piano keyboard.
- Drum machine: **8×16 step sequencer** in bottom panel; lane **icons** audition via `play_sample`; hover shows full instrument name.
- Drum samples play for **full WAV duration** (not truncated to one 16th) on lane audition, step preview, and timeline hits.
- Drum machine: **local Play/Stop** loops the pattern via native `start_pattern_preview` (independent of main transport).
- Drum machine: step cells toggle pattern matrix; timeline block shows **miniature grid** with dimmed loop iterations.
- **Track row click** selects track; bottom panel follows `selectedTrackId` (no separate “Set keyboard”).
- **No Capture toggle** — recording uses arm + Start Recording only (drum machine does not use pad record).
- New drum track spawns empty **Pattern A** 1-bar clip at playhead.

## Engine
- `assign_track_instrument` receives catalog-resolved payloads (not hardcoded FourOsc).
- `play_sample` triggers one-shot preview on `sample_kit` tracks.
- `upsert_audio_clip` places pattern `lanes` with **bar repeat** across `lengthBeats` (truncates at block end).
- `start_pattern_preview` / `stop_pattern_preview` drive local sequencer loop; `onDrumPatternStep` updates UI playhead column.
- Voice record → stop → playback heal still works on BT and wired outputs.
- Transport remains linear (no default looping).

## LLM-readiness (no parser in-app)
- `applyArrangementOperations` can script track + pattern + clip creation with `skipNativeRefresh` for tests.
- `captureProjectSnapshot` returns stable arrangement read model including `patterns`.
- Sample catalog entries expose tags for future external selection.

## Manual audio (after C++ rebuild)
1. `npm run dev` for development, or `npm run pack` and launch the packaged Electron app.
2. Lane icon audition: tom1, tom2, open hat, **perc** — full decay (not choked).
3. Toggle **perc** steps on a pattern saved before the 8-lane kit.
4. Local Play + timeline Play over Pattern A (Return to Zero first).
5. Hover each lane icon — tooltip shows full instrument name.

## Commands
Run before merge:
- `npm test -- --runInBand`
- `npm run build:electron`
- `npm run build:engine`
- `npm run build`
