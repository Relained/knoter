# knoter progress (current state)

Last updated: 2026-06-10

Implemented state of the monorepo (`cli/`, `web/`, shared `docs/`).
Remaining work and decisions live in `docs/plan/roadmap.md`.

## Implemented Backbone

CLI:

- vault/add/sync/search/get/tag/template/report/mcp/service/llm command surfaces
- `kn get batch` and MCP batch retrieval for agent workflows
- source/rewritten/artifact DB metadata
- source metadata-only ingest
- rewritten/artifact chunking, FTS, vector indexing
- artifact default search exclusion
- explicit raw `kind` storage without auto type inference
- OpenAI-compatible embedding provider path
- CLI-owned embedding container/runtime code removed; the CLI stores and calls
  an external embedding server API endpoint
- CJK chunking/search fallback improvements
- MCP stdio tools for template/report/rewrite/add-note
- `kn report context` JSON bundle with previous 7-day continuity
- optional TEI integration test harness for OpenAI-compatible local embeddings
- CLI document graph projection table and refresh path for lineage,
  template/artifact, note/chunk containment, and chunk adjacency edges
- `kn llm rewrite`: an external agent authors rewritten + template-justified
  artifact notes in an isolated workspace, then the CLI imports and indexes
  them. Selectable runtimes: Codex CLI (`--agent codex`, default) and Claude
  Code CLI (`--agent claude`)
- deterministic agent scenario fixtures (`src/core/agent-fixtures.ts`,
  `scripts/agent-fixtures.ts`) installed by `scripts/test-env.sh ensure`
- expanded artifact workflow template (`docs/template.md` v3) letting the agent
  choose scenario artifacts instead of forcing one daily artifact per source
- TypeScript check passes for the active CLI codebase

Web:

- React/Vite web renderer on dedicated local port `39281`
- Electron-backed web development shell; `npm run dev` bootstraps the CLI test
  vault, starts Vite, and launches an Electron BrowserWindow through preload
  IPC; macOS hidden-titlebar shell with a tab-row drag region
- HTML-first workbench renderer (`web/src/workbench/`): sandboxed HTML page
  tabs, overlay menu/tab bars, command palette, source draft modal, settings
  page
- command registry as the single action source: every UI button runs the same
  `executeCommand` path as the palette; parameterized commands open a
  two-stage option form (design: `docs/design/web-commands.md`)
- keybinding system: chord→command bindings with defaults, settings recorder
  UI, palette shortcut hints
- right-side widget bar (pin any view, ratio split with drag resize) and bell
  notifications with transient toasts (design: `docs/design/widget-bar.md`)
- workbench wired to the CLI-backed Electron bridge: vault documents open as
  dynamic palette commands rendered with `marked` through the sandbox
  sanitize path
- typed web API/IPC contracts for vault (getActive/switch/list/status),
  explorer, graph, search, sync, add-source picker, note save, template, tag,
  report context, llm rewrite, and sanitized external HTML windows
- Electron IPC handlers call the CLI JSON surface; this is an interim
  CLI-backed bridge, not a packaged daemon

## Removed / Replaced

- The previous pane/tab/floating-window workspace, sidebar surface host,
  renderer registry, old keybinding modules, Graph 3D template preview, and
  the web Playwright/unit harness were removed with the workbench rewrite. Do
  not claim that coverage or resurrect those modules.
- `web/docs/*` design notes and the old `web/agents.md` GPT harness are gone;
  `web/agents.md` is now the package agent guide and shared docs live in root
  `docs/`.

## Verification Baseline

Use these before code-affecting commits:

```bash
cd cli
# Current ad hoc typecheck; package metadata/check script is P1 work.
bunx tsc --noEmit
bun test
git diff --check
```

For web-affecting changes:

```bash
cd web
npm run check
```

Web dev smoke:

```bash
cd web
npm run dev
```

This bootstraps the CLI test vault (skip with `KNOTER_DEV_TEST_VAULT=0`),
starts or reuses the Vite renderer server on `127.0.0.1:39281`, and launches
the Electron shell.

Detailed test and environment instructions live in `docs/testing.md`.
