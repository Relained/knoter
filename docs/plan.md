# knoter current plan

Last updated: 2026-06-10

## Current State

CLI and web frontend are split inside one monorepo: `cli/`, `web/`, and shared
root `docs/`.

Implemented backbone:

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
- `kn llm rewrite`: Codex CLI authors rewritten + template-justified artifact
  notes in an isolated workspace, then the CLI imports and indexes them
- deterministic agent scenario fixtures (`src/core/agent-fixtures.ts`,
  `scripts/agent-fixtures.ts`) installed by `scripts/test-env.sh ensure`
- expanded artifact workflow template (`docs/template.md` v3) letting the agent
  choose scenario artifacts instead of forcing one daily artifact per source
- TypeScript check passes for the active CLI codebase
- React/Vite web renderer on dedicated local port `39281`
- Electron-backed web development shell; `npm run dev` bootstraps the CLI test
  vault, starts Vite, and launches an Electron BrowserWindow through preload IPC
- typed web API/IPC contracts for vault, explorer (list/read/refresh), graph,
  search, and sanitized external HTML windows
- Electron IPC handlers call the CLI JSON surface for active vault/template/
  search data and scan active vault source/legacy rewritten/artifact
  directories for Explorer projection data; this is an interim CLI-backed
  bridge, not a packaged daemon
- HTML-first workbench renderer (`web/src/workbench/`): HTML page tabs, overlay
  menu/tab bars, command palette, source draft modal, settings page, sandboxed
  HTML rendering

Removed/replaced:

- The previous pane/tab/floating-window workspace, sidebar surface host,
  renderer registry, keybindings, Graph 3D template preview, and the web
  Playwright/unit harness were removed with the workbench rewrite. Do not claim
  that coverage or resurrect those modules.
- `web/docs/*` design notes and the old `web/agents.md` GPT harness are gone;
  `web/agents.md` is now the package agent guide and shared docs live in root
  `docs/`.

## Active Decisions

- Target model is Source / Artifact. `rewritten` is a legacy alias for
  agent-authored indexed knowledge until the storage/search migration removes it.
- Source files are moved/copied under `sources/YYYY-MM-DD/` and referenced by path.
- `knoter` stores and validates source/artifact documents; it does not generate
  their prose in normal `kn` commands.
- Artifact display is HTML-first, with a separate plain text search projection
  in the target model. Untrusted agent HTML renders only through the sandboxed
  iframe or the sanitized external window path.
- Default retrieval target is `artifact.kind: llm-wiki`. Current CLI still
  excludes artifacts by default and uses legacy rewritten as the default indexed
  knowledge layer until kind-filtered llm-wiki retrieval is implemented.
- Task/workout/area/metric extraction belongs to the external agent when it
  updates artifacts.
- One template file exists per vault at `.kn/template.md`; `docs/template.md` is bundled fallback.
- `kn llm` is the only namespace allowed to assemble prompts or call LLMs.
  `kn llm rewrite` is the current implementation with selectable external agent
  runtimes: Codex CLI (`--agent codex`, default) and Claude Code CLI
  (`--agent claude`).
- Service lifecycle belongs to a future packaged app layer, not the current
  React/Vite web renderer. CLI only exposes service endpoint status/probing.
- Cluster analysis belongs to a future app/frontend layer with direct zvec
  access, not the CLI command surface.
- PageIndex is a future PoC, not current retrieval backend.
- `kn mcp` stdio is the compatibility baseline. HTTP/daemon/stop exists in code
  as experimental surface and needs explicit hardening before being promoted.
- Branch layout (restructured 2026-06-10): `main <-> dev <-(PR)- topic
  branches`. `dev` is the integration base; topic branches use
  `features/<name>`, `webs/<name>`, `backs/<name>`, or `refactoring/<name>`
  and merge into `dev` via PR; `main` is synchronized from `dev` only.
  Legacy `cli/*`, `web/*`, `integration/*` branches are retired
  (`cli/document-graph` is kept until its unmerged commit is triaged).
- OS-standard config/cache/state/log directory migration is intentionally
  deferred. Current test-generated DB/cache output is kept under project-local
  ignored directories where tests need persistent filesystem artifacts.
- Graph 2D/3D renderer implementation is deferred until the web API/daemon
  bridge can provide real graph payloads (`document_graph_edges`) from vault
  data. `graph.get` currently returns an edge-less Explorer projection.

## P0 Current Work

0. Midterm-demo workbench features (design: `docs/widget-bar.md`)
   - [x] Widget bar: right-side vertical stack of pinned artifact views
     (any view kind), equal ratios by default, divider drag resize, bar width
     drag resize, localStorage layout persistence.
   - [x] Notification relocation: remove the bottom-right toast hub; bell icon
     above settings in the overlay menu bar with unread badge and history
     popup; new messages show a 4s auto-dismiss transient toast.
   - [x] `kn llm rewrite --agent claude`: Claude Code CLI runner alongside the
     Codex runner (`--claude-bin`, `KN_CLAUDE_BIN`, generalized rewrite
     prompt), with mock-runner test coverage.
   - [ ] Manual dev-shell smoke pass of the widget bar / notification flows
     (`npm run dev`) before the midterm demo.

1. Workbench/IPC integration (design: `docs/web-commands.md`)
   - [x] Wire the workbench renderer to `window.knoterApi` (explorer, search,
     vault); vault documents surface as dynamic palette commands while
     builtin fixture views remain as demo widgets.
   - [x] Open Explorer/search results as HTML page tabs through
     `explorer.read` with the sandboxed rendering path (`marked` md→HTML).
   - [x] Command registry: declarative command list with per-command option
     schemas, palette two-stage option form, all UI buttons routed through
     `executeCommand` (single source with the palette).
   - [x] New backend IPC surface: vault list/status, sync, add-source picker,
     note save (temp file + `kn add`), template get/list, tag list/add/remove,
     report context, llm rewrite (codex|claude, 300s timeout, lock retry).
   - [ ] Manual GUI smoke pass of the checklist in `docs/web-commands.md`.
   - [ ] Decide settings persistence: expose the JSONC config-file bridge from
     preload or commit to localStorage-only for now.
   - [ ] Design-defect fixes from the large-app GUI comparison review — plan
     and status tracked in `docs/web-fix-plan.md` (Phase 1 layout bugs, palette
     keyboard navigation, theme passthrough, long-op progress, a11y).
   - [x] Keybinding system: chord→command bindings over the command registry
     with defaults (`Mod+K` palette, `Mod+S` note save, tab cycling), settings
     recorder UI, palette shortcut hints; Escape no longer opens the palette.

2. Source / Artifact model migration
   - [ ] Add Source metadata fields: `media_type`, `privacy`, `time_scope`,
     `wiki_policy`, `extraction_status` (the source modal UI already drafts
     these values).
   - [ ] Add source extraction projection storage for PDF/OCR/text/image
     captions and confidence/page/region metadata.
   - [ ] Add artifact display/search projection split: HTML display, plain-text
     search projection, heading outline, source references.
   - [ ] Promote `artifact.kind: llm-wiki` to the default retrieval target.
   - [ ] Migrate `rewritten` storage/search behavior to legacy alias or remove it
     after fixture and report-context updates.

3. Web cache rebuild
   - [ ] Rebuild project-local web cache from CLI/vault source data
     (recoverable projection; CLI metadata stays authoritative).

4. Signal storage contract
   - Define accepted external-agent JSON shape for task/workout/daily/area/metric.
   - Store only explicit agent output.
   - Do not infer global type/kind automatically.

5. `kn llm` follow-up
   - [x] `kn llm rewrite` with Codex CLI, isolated workspace, vault import.
   - [ ] Evaluate additional explicit workflows (artifact refresh/update) only
     when explicitly needed; keep normal commands prose-free.

## P1

- Package metadata: rename package to `knoter`, add `bin.kn`, add package-local
  `check` script, pin TypeScript, confirm build layout.
- CJK indexing: evaluate trigram setup and preprocessor direction.
- Verification: broaden CLI E2E for `--dry-run`, `--tag`, `--after`, adjacent
  chunk merge, vector rollback. Reintroduce a web test harness for the
  workbench before claiming web behavior coverage.
- Packaged-app integration design for local TEI start/stop/status using the
  CLI's external service boundary. Electron shell exists, but TEI lifecycle
  control is still deferred.
- Switch web `graph.get` from the Explorer projection to the CLI
  `document_graph_edges` table when the bridge is ready.
- PageIndex PoC milestone design.
- OS-standard path migration for config/data/cache/state/log directories.
  Keep this after the current web API bridge stabilizes.

## P2

- Packaged-app-owned local service execution UX, including macOS local TEI defaults.
- Harden or remove experimental HTTP/daemon MCP surface.

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
