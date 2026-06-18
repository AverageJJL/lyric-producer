# AGENTS.md

## Project Context
This is a Headless DAW evolving into an **AI Producer Core** creative studio. The desktop UI is built with Electron + React DOM. The backend is a C++ audio engine connected through Electron IPC and a synchronous Node-API native addon. The supported desktop distribution path is Electron on Windows and macOS.

**Active plan:** `docs/plans/ai-producer-core-plan.md`.

## Architectural Rules & Cross-Platform Boundary
- **Pure C++ Core:** All core realtime DAW audio logic, state management, and project/engine JSON parsing MUST live in the `shared_cpp` directory. These files MUST be written in pure, standard C++17 or higher. They cannot contain any OS-specific headers (no `<windows.h>`, no `<Foundation/Foundation.h>`).
- **Native Wrapper:**
  - The Electron bridge lives under `electron/` and calls `shared_cpp` through the Node-API addon.
  - Platform-specific desktop packaging belongs in Electron Builder config, not separate React Native platform folders.
- **No Audio in JS:** JavaScript NEVER processes, decodes, buffers, or analyzes audio. The UI only sends JSON payloads (state, MIDI, DSP parameters, capture controls, profile snapshots) to the C++ engine. No non-C++ audio-analysis sidecar is currently approved.

## Code Quality & Documentation
- Write thorough, conversational comments explaining *why* a specific architectural decision was made.
- Keep UI components purely functional, minimalist, and styled closely to Logic Pro (dark mode, sleek). 
- All files must remain under 300 lines. Break large files into smaller modules.

## Workflow
- Do not implement a feature unless it is explicitly in the active plan document.
- Never delete this file.
