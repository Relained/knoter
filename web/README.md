# knoter web

HTML-first workbench frontend for knoter: React 18 + TypeScript + Vite 5, with
an Electron development shell whose IPC handlers call the CLI in `../cli`.

## Quick Commands

```bash
npm install
npm run check   # tsc --noEmit && vite build — verification baseline
npm run dev     # Vite on 127.0.0.1:39281 + Electron shell
```

`npm run dev` starts Vite and the Electron shell against the active vault
registered in `~/.config/knoter/config.json`. The old test-vault bootstrap was
removed with the test environment.

There is currently no web unit-test or E2E harness; `npm run check` is the only
automated verification.

## Layout

- `src/workbench/`: workbench UI — HTML page tabs, overlay bars, command
  palette, source modal, settings page.
- `src/core/`: typed renderer API, IPC contracts, preload adapter shape,
  global settings runtime.
- `src/shared/`: semantic icons, Base16 theming, token/component CSS.
- `electron/`: Electron main process, preload bridge, CLI-backed IPC handlers.
- `scripts/dev-electron.mjs`: `npm run dev` orchestration.

## Docs

- `agents.md` (agent work guide for this package)
- `../docs/architecture.md`, `../docs/codebase.md`, `../docs/testing.md`,
  `../docs/plan/` (progress.md, roadmap.md)
