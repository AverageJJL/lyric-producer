# AI Producer Roadmap

> Companion product roadmap for `docs/plans/ai-producer-core-plan.md`.
> The master plan remains the canonical build checklist; this document explains what the AI Producer should become from a songwriter/producer workflow point of view.

---

## 1. Product Thesis

AI Producer Core should behave less like a generic chat box and more like a patient studio producer sitting beside the songwriter.

The songwriter should be able to arrive with incomplete material: a rough hook, a vague mood, a reference track, a lyric fragment, or feedback like "the verse feels empty" or "make the chorus lift." The AI Producer should translate that messy creative language into concrete, auditionable DAW changes while keeping the human in control.

Execution still follows the app's hard boundary:

- JavaScript never processes audio.
- Audio capture, playback, DSP, analysis, and rendering stay in `shared_cpp`.
- AI execution is validated JSON through orchestration, arrangement operations, and native commands.
- Every meaningful musical change is previewable, undoable, and respectful of locks and preserve settings.

---

## 2. How Songwriters Usually Talk To Producers

Songwriters rarely communicate like engineers at first. They usually describe the emotional and musical target in human terms, then refine through listening.

Common songwriter inputs:

- **Vibe and emotion:** "darker," "hopeful but not cheesy," "more late-night," "less polished."
- **References:** "like the bounce of this song," "more Frank Ocean chords," "drums like an old Neptunes record."
- **Hooks:** described as "the part everyone remembers," tapped as a rhythm, or referenced from existing session material.
- **Arrangement feedback:** "the chorus does not hit," "the second verse needs movement," "drop everything before the bridge."
- **Performance notes:** "I sang that too stiff," "keep the first line from take two," "make the timing feel more human."
- **Sound direction:** "warmer piano," "bass should answer the vocal," "make the drums knock but leave space."
- **Creative uncertainty:** "I do not know what it needs," "give me three directions," "make it feel finished."

The working loop is normally:

1. The songwriter shares an idea, feeling, reference, or rough performance.
2. The producer asks a small number of clarifying questions when needed.
3. The producer proposes concrete options, not abstract advice.
4. The pair listens, chooses what works, and discards what does not.
5. The producer keeps the session moving toward a complete song.

---

## 3. What A Producer Normally Does

A producer turns intent into decisions. They do not just "generate music"; they protect the song's identity while solving practical problems.

Core producer responsibilities:

- **Find the center:** identify tempo, key, hook, emotional target, and the strongest part of the idea.
- **Shape structure:** turn a loop or sketch into intro, verse, pre-chorus, chorus, bridge, breakdown, outro, or beatmaker-style sections.
- **Choose sounds:** pick instruments, samples, presets, drum kits, and textures that support the song rather than crowd it.
- **Write supporting parts:** bass lines, countermelodies, chord voicings, drum variations, transitions, fills, risers, and ear candy.
- **Source material:** find or create the right samples, one-shots, loops, and playable instrument tones before committing them to the session.
- **Coach performances:** suggest retakes, comp the best moments, fix phrasing issues, and keep expressive timing when it matters.
- **Manage versions:** preserve good ideas, offer alternatives, A/B takes, and avoid destructive edits.
- **Solve mix problems:** notice masking, headroom, harshness, weak low end, and unclear vocals.
- **Finish:** help the artist decide when the arrangement, mix, and export are good enough to share.

The AI Producer roadmap should mirror those jobs inside the DAW.

---

## 4. Current App Gaps

Based on the active plan and current Copilot surface, the app already has strong DAW foundations, a validated arrangement layer, lock/preserve guardrails, native audio boundaries, spectrogram foundations, mix anomaly detection, and limited AI handoff infrastructure.

The missing product layer is the actual producer experience.

Current gaps:

- **Copilot is mostly guidance plus pending whole-MIDI-block edits.** It can answer workflow questions, highlight UI controls, and propose limited MIDI block changes, but it cannot yet act across a full song production workflow.
- **Captured-performance-to-arrangement is removed from active scope.** There is no sidecar, pitch-note payload, inline capture UI, or assistant application flow for converting rough vocal ideas into MIDI.
- **No producer-style intake.** There is no structured way to ask for vibe, references, chorus goal, vocal role, song section target, or whether the user wants conservative vs bold production.
- **No assisted startup UI.** The structure-first/sample-stacking library exists, but there is no new-project "head start" flow with vibe Q&A, sample selection, and session bootstrap.
- **No option-card decision loop for song ideas.** Users need 2-3 musical directions they can audition and apply, especially for hooks, arrangements, and sound choices.
- **Limited sample discovery and recommendations.** The app has bundled/downloadable sample foundations, but not a broad producer-grade discovery layer with contextual suggestions.
- **No Freesound/API-backed sample search.** Users cannot ask for highly rated outside samples, preview them, review license metadata, and import only the keepers.
- **No generated sample or instrument-sound path.** The roadmap does not yet cover AI-created one-shots, textures, or playable tones from model providers such as MRT2-style instrument generation.
- **No Copilot-window audition lane.** Chord, MIDI, and sample options cannot yet be previewed directly in Copilot before applying or importing them.
- **No AI take history UI.** Retries and alternatives need an A/B drawer or take lane so the user can return to earlier good ideas.
- **No conversational arrangement critique.** The AI does not yet inspect the song as a producer and say what is working, what is missing, and what it can try next.
- **No performance coaching workflow.** Recording takes exist, but the AI does not yet help choose takes, identify weak phrases, or suggest targeted retakes.
- **No final polish flow.** Mix suggestions exist as foundations, but there is no end-to-end "get this ready to share" producer pass.

---

## 5. Roadmap

### Phase A: Producer Conversation Model

- Add a producer-intake prompt model that understands songwriter language: vibe, references, hook, section, arrangement problem, sound direction, and uncertainty.
- Teach Copilot to ask short producer-style follow-ups only when the missing choice would materially change the result.
- Add response modes for advice, critique, and proposed operations so users can ask "what does this need?" without immediately changing the project.
- Keep answers practical and session-oriented: what to try, why it helps the song, and what will be changed if applied.

### Phase B: Assisted Project Startup

- Build the "Empty project vs Head start" new-session flow already described in the master plan.
- For Head start, collect a short creative brief: genre/vibe, vocal or instrumental target, tempo energy, reference notes, and linear song vs looper mode.
- Present curated sample or instrument stacks from the local catalog, downloaded packs, license-safe Freesound results, and optional generated candidates.
- Bootstrap selected material into the project with section markers or looper containers, using native-analyzed imports and validated arrangement operations.

### Phase C: Sample Intelligence And Sound Generation

- Add a producer-grade sample discovery layer that can recommend drums, bass shots, textures, Foley, transitions, and loops from the project context.
- Use Freesound or similar APIs to fetch highly rated, tagged, license-safe sounds; show source, author, rating, license, duration, and tags before import.
- Let users preview sample candidates in Copilot or the sample browser before downloading/importing them.
- Route approved external samples through the existing native-analyzed media import path so waveform, transient, and project-media metadata stay consistent.
- Add a model-agnostic generation adapter for one-shots, textures, and playable instrument sounds; document MRT2-style models as candidates, not required dependencies.
- Treat generated sounds like imported media: cache them, analyze them natively, preserve prompt/provider metadata, and require user confirmation before placing them in the arrangement.
- Let the AI suggest sample stacks for a requested role, such as "three dusty snare options," "airy vocal textures," or "a darker bass one-shot for this chorus."

### Phase D: Captured Performance Ideas (Out Of Active Scope)

- Do not reintroduce captured-performance conversion without a new approved plan that updates the native/audio boundary first.
- Any future workflow must keep audio processing out of JavaScript, avoid raw local audio in Copilot payloads, and use only validated arrangement operations for execution.
- Until that future plan exists, Copilot should work from text, project snapshots, selected MIDI/audio metadata, and existing native analysis outputs.

### Phase E: Co-Writing And Arrangement Builder

- Let users ask for section-level production moves: "make an intro from this loop," "build a pre-chorus," "make chorus two bigger," or "strip verse two down."
- Generate 2-3 previewable alternatives for chords, bass answers, melodies, drum variations, fills, transitions, countermelodies, and texture layers.
- Add a Copilot audition lane for generated MIDI/chord options so the user can hear each candidate before committing it to the timeline.
- Respect locked clips/tracks, frozen tracks, preserve matrix settings, and looper vs linear project mode.
- Offer alternatives instead of one silent mutation: conservative, bolder, and left-field when the request is open-ended.
- Apply only the chosen option as an undoable arrangement operation; rejected options should remain recoverable through future take/history UI.
- Add arrangement critique that names the likely issue and suggests one or two concrete fixes.

### Phase F: Performance Coach And Take History

- Add an AI take-history foundation for producer retries and arrangement alternatives.
- Add an A/B drawer or take panel that keeps prior AI attempts recoverable.
- For recording workflows, let the AI summarize takes and suggest retakes without replacing the user's performance automatically.
- Preserve human timing and emotional phrasing when the user marks those as important.
- Support focused prompts like "keep the first half of take one and the last line of take three" once comp metadata is ready.

### Phase G: Mix, Sound Direction, And Final Polish

- Expand mix anomaly explanations into producer-facing guidance: "the vocal is masked by the pad," "kick and bass are fighting," or "chorus lacks transient lift."
- Convert accepted mix ideas into animated, visible FX suggestions before applying native changes.
- Add sound-direction workflows: warmer, brighter, tighter, wider-feeling without unsafe stereo execution, more intimate, more aggressive, more vintage.
- Add a final polish pass that checks arrangement completeness, obvious mix issues, export readiness, and missing song metadata.
- Keep final export guidance separate from release-signing or app-distribution readiness.

---

## 6. Acceptance Criteria

The AI Producer experience is on track when a songwriter can:

- Start with a vague brief or an empty project and get a useful head start.
- Describe a hook, arrangement problem, or sound direction and receive 2-3 auditionable options.
- Ask for sounds or samples and preview curated choices before importing them.
- Generate or discover instrument/sample candidates while preserving source, provider, prompt, and license metadata.
- Generate three chord or MIDI options, audition them in Copilot, and apply only the chosen one.
- Ask why a section feels weak and receive concrete producer suggestions.
- Apply AI changes only after preview/confirmation.
- Recover older AI attempts and compare alternatives.
- Trust that locked material, preserved feel, and native audio boundaries are respected.
- Finish a rough idea into a shareable song without needing to think like a DAW engineer.

---

## 7. Guardrails For Future Implementers

- Do not implement roadmap items unless they are also represented in the canonical build plan or the user explicitly updates scope.
- Keep audio processing, analysis, recording, rendering, and DSP in `shared_cpp`.
- Use Electron/Node-API bridges for provider handoff and native commands.
- Use validated JSON for execution; prose is for the human, not the engine.
- Keep changes undoable and visible before destructive application.
- Preserve attribution and license metadata for Freesound or any external sample source.
- Cache external/generated audio and import it through the existing native-analyzed media path.
- Use native MIDI/audio preview commands for Copilot audition playback; do not play or process audio in the renderer.
- Follow the existing Logic-style dark, minimalist UI direction.
- Keep files under 300 lines; split implementation modules when needed.
