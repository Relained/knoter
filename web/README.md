# knoter web

HTML-first workbench frontend for knoter: React 18 + TypeScript + Vite 5, with
an Electron development shell whose IPC handlers call the CLI in `../cli`.

## Quick Commands

```bash
npm install
npm run check   # tsc --noEmit && vite build — verification baseline
npm run dev     # test vault bootstrap + Vite on 127.0.0.1:39281 + Electron shell
```

`npm run dev` runs `../cli/scripts/test-env.sh ensure` first and points
`KN_HOME` at `../cli/.test-kn-home` so the Electron IPC bridge sees the test
vault. Set `KNOTER_DEV_TEST_VAULT=0` to skip the bootstrap, or `=1` to make
bootstrap failure stop dev startup.

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
  `../docs/plan.md`
