# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repo also has an `AGENTS.md`; the architectural rules below are the canonical source and are kept in sync with it. Never delete `AGENTS.md`.

## Project

A headless DAW evolving into an **AI Producer Core** creative studio. Desktop app is **Electron + React DOM (renderer) + Zustand (state)**, with all realtime audio in a **pure C++17 engine** under `shared_cpp/`, reached through a synchronous Node-API native addon. Supported distribution is Electron on Windows and macOS. Active plan: `docs/plans/ai-producer-core-plan.md`.

## Commands

```sh
npm run setup:submodules   # FIRST in a fresh clone/worktree: fetch JUCE + tracktion_engine submodules
npm run dev                # rebuild engine + electron + start Vite, then launch Electron at that URL
npm test -- --runInBand    # Jest (jsdom). Use --runInBand to avoid native/IPC contention
npm run lint               # eslint over .js/.jsx/.ts/.tsx/.mjs/.cjs
npm run build:engine       # cmake-js compile of the C++ addon against the Electron runtime
npm run build:electron     # tsc of electron/ main+preload
npm run build              # engine + electron + vite build (full validation build)
npm run pack               # unpacked local app (electron-builder --dir)
npm run dist               # platform distributable
```

Run a single Jest test: `npm test -- AppCopilot.test.tsx` (or `-t "<test name>"`). Tests live in `__tests__/` (~220 files); `shared_cpp/` is excluded from Jest.

`smoke:native-*` scripts (e.g. `npm run smoke:native-fx`) exercise the compiled C++ engine end-to-end; `validate:*` scripts gate release/packaging. C++ unit tests build separately under `shared_cpp/build-test/` and are not run by Jest.

## Architecture: the command path

Audio commands flow one direction through four layers — understand this before touching anything audio-related:

1. **Renderer** (`src/`) mutates Zustand state in `src/store/useDAWStore.ts`, then calls `sendNativeAudioCommand(command, payload)` in `src/native/NativeAudioEngine.ts`.
2. **Preload** (`electron/preload.ts`) exposes `window.audioEngine.sendCommand` via `contextBridge`, forwarding over **synchronous** IPC (`ipcRenderer.sendSync('audio-engine:send-command', ...)`).
3. **Main** (`electron/main.ts`) hands the call to the Node-API addon (`electron/native/NativeAudioEngineAddon.cpp`).
4. **C++ engine** routes `(command string, JSON payload)` through `shared_cpp/CommandDispatcher` to a handler on `AudioEngineController`, returning a **JSON string** response. Engine→renderer pushes (transport ticks, meters, spectrograms) go back through `setEventCallback` → `audio-engine:event` IPC → listeners wired in `src/store/useDAWNativeEvents.ts`.

The contract between JS and C++ is **always a command name + JSON in, JSON out** — there is no shared binary ABI beyond that. The native addon is also a separate build artifact (`electron/native/build-release/...`), unpacked from the asar at runtime.

Other IPC (project files, media import, sample library, Copilot, FX window) uses async `ipcRenderer.invoke`; each surface is registered by a `register*Ipc` function called from `main.ts` and exposed under its own `contextBridge` namespace in `preload.ts`.

### AI Copilot

The **only** Copilot path is the agentic tool-loop in `electron/copilotAgentLoop.ts` (renderer entry `src/assistant/runCopilotAgent.ts` → `copilot:agent-ask` IPC). It runs in the Electron main process and calls an OpenAI-compatible API. At runtime the model provider is **OpenRouter**: the loop reads `OPENROUTER_API_KEY` and the `AI_PRODUCER_*` vars from `.env` (see `.env.example`). The Copilot supports `build` and `ask` (read-only companion) modes; long conversations are compacted via `electron/copilotCompaction.ts`. Tool/contract schemas live in `electron/copilot*Contract.ts`.

## Hard rules (cross-platform boundary)

- **Pure C++ core.** All realtime audio logic, DAW state, and project/engine JSON parsing live in `shared_cpp/` as standard C++17+. **No OS-specific headers** (`<windows.h>`, `<Foundation/Foundation.h>`, etc.).
- **No audio in JS.** JavaScript never processes, decodes, buffers, or analyzes audio. The renderer only ships JSON (state, MIDI, DSP params, capture controls, profile snapshots) to the C++ engine.
- **No approved audio-analysis sidecar.** There is currently no non-C++ audio-analysis sidecar. Any future sidecar needs an approved plan and must not own playback, timeline mutation, DAW state, DSP, project parsing, renderer audio, or raw local audio handoff to Copilot.
- **Native wrapper boundary.** The Electron bridge lives under `electron/` and reaches `shared_cpp` only through the Node-API addon. Desktop packaging is electron-builder config in `package.json`, not platform source folders.

## Conventions

- **Keep every file under 300 lines.** Break large modules into smaller ones.
- Write conversational comments explaining *why* an architectural decision was made, not what the code does.
- UI components are purely functional, minimalist, styled close to Logic Pro (dark, sleek).
- Do not implement a feature unless it is explicitly in the active plan document (`docs/plans/`).
- Token budgets / model names are duplicated between `electron/copilotRequest.ts` and `src/assistant/copilotMemory.ts` (the renderer cannot import from `electron/`) — change both together.
