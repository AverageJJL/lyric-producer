# AI Producer Core

Electron desktop shell for the Headless DAW / AI Producer Core. The renderer is React DOM + Zustand, and audio stays in the native C++ engine under `shared_cpp`.

## Development

Before the first native build in a fresh clone or new Git/Codex worktree, prepare
the C++ audio dependencies:

```sh
npm run setup:submodules
```

```sh
npm run dev
```

`npm run dev` rebuilds the native engine, rebuilds the Electron main/preload files, starts Vite on an available localhost port, then opens Electron with that exact renderer URL.

## Validation

```sh
npm test -- --runInBand
npm run build:electron
npm run build:engine
npm run build
```

## Packaging

```sh
npm run pack
npm run dist
```

`pack` builds an unpacked local app. `dist` creates the Electron Builder distributable for the current platform.
