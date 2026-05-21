# knoter current plan

Last updated: 2026-05-22

## Current State

CLI and web frontend are now split inside one monorepo: `cli/`, `web/`, and shared root `docs/`.

Implemented backbone:

- vault/add/sync/search/get/tag/template/report/mcp command surfaces
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
- TypeScript check passes for the active CLI codebase
- React/Vite web renderer on dedicated local port `39281`
- Electron-backed web development shell on `web/graph-backend`; `npm run dev`
  starts Vite and an Electron BrowserWindow through preload IPC.
- typed web API, IPC, cache, and daemon boundary contracts for vault explorer,
  graph, search, and refresh operations
- IDE-style web sidebar surface host with Explorer/Search/Graph/Tasks/Settings
  surfaces
- Explorer surface source/rewritten/template space selection, defaulting to
  template-only
- Playwright smoke E2E for web workspace shell, command palette, split pane, and
  floating windows
- web Graph 3D exists as a template preview/state placeholder, not a real graph
  engine yet

## Active Decisions

- Source files are moved/copied under `sources/YYYY-MM-DD/` and referenced by path.
- Rewriting is always performed by an external LLM agent.
- `knoter` stores and validates rewritten/artifact documents; it does not generate their prose in normal `kn` commands.
- Artifact documents are indexed but excluded from default search. Use `--include-artifacts` explicitly.
- Task/workout/area/metric extraction belongs to the external agent at rewritten time.
- One template file exists per vault at `.kn/template.md`; `docs/template.md` is bundled fallback.
- `kn llm` is the only future namespace allowed to assemble prompts or call LLMs.
- Service lifecycle belongs to a future packaged app layer, not the current
  React/Vite web renderer. CLI only exposes service endpoint status/probing.
- Cluster analysis belongs to a future app/frontend layer with direct zvec
  access, not the CLI command surface.
- PageIndex is a future PoC, not current retrieval backend.
- `kn mcp` stdio is the compatibility baseline. HTTP/daemon/stop exists in code
  as experimental surface and needs explicit hardening before being promoted.
- Local branch layout:
  - `dev`: root agent guide baseline.
  - `web/graph-backend`: web sidebar/API/Electron work.
  - `cli/document-graph`: CLI document graph persistence work.
- OS-standard config/cache/state/log directory migration is intentionally
  deferred. Current test-generated DB/cache output is kept under project-local
  ignored directories where tests need persistent filesystem artifacts.
- Graph 2D/3D renderer implementation is deferred until the web API/daemon
  bridge can provide real graph payloads from vault data.

## P0 Current Work

1. Document/code structure cleanup
   - Active docs: `docs/README.md`, `docs/architecture.md`, `docs/codebase.md`, `docs/plan.md`, `docs/template.md`, `docs/testing.md`.
   - Legacy docs move under `docs/archive/`.
   - Report context internals split into small modules.
   - [x] Active docs updated for monorepo split, ports, web verification, MCP
     surface, and current CLI/web boundaries.

2. Template contract validation
   - [x] Validate required frontmatter fields when present.
   - [x] Validate required sections/variables contract.
   - [x] Return machine-readable `errors`, `warnings`, and `checks`.
   - [x] Keep validation local; no LLM call.

3. Web app backend boundary
   - [x] Add renderer-side typed API contract for vault, explorer, graph, and search.
   - [x] Add preload IPC adapter shape and Electron main IPC skeleton.
   - [x] Add recoverable cache manifest/types for future web cache DB/snapshot files.
   - [x] Convert `npm run dev` to launch Vite plus Electron shell.
   - [ ] Replace mock Electron IPC handlers with daemon-backed handlers.
   - [ ] Load real active vault explorer data into the Explorer surface.
   - [ ] Rebuild project-local web cache from CLI/vault source data.

4. CLI document graph branch
   - Branch: `cli/document-graph`.
   - [x] Add SQLite `document_graph_edges` projection table.
   - [x] Build graph edges from source/rewritten lineage, template/artifact
     lineage, note/chunk containment, and chunk prev/next links.
   - [x] Refresh graph projection after successful CLI add/sync/add-note flows.
   - [x] Keep stale `source_note_id` frontmatter FK-safe and recover lineage
     through `source_path`.
   - [ ] Merge or rebase into the final integration branch after web IPC/daemon
     bridge is ready.

5. Signal storage contract
   - Define accepted external-agent JSON shape for task/workout/daily/area/metric.
   - Store only explicit agent output.
   - Do not infer global type/kind automatically.

6. `kn llm` plan
   - Start with prompt/context helpers.
   - Keep actual LLM run commands deferred unless explicitly needed.

## P1

- Package metadata: rename package to `knoter`, add `bin.kn`, confirm build layout.
- CJK indexing: evaluate trigram setup and preprocessor direction.
- Verification: broaden CLI E2E for `--dry-run`, `--tag`, `--after`, adjacent
  chunk merge, vector rollback.
- Packaged-app integration design for local TEI start/stop/status using the
  CLI's external service boundary. Electron shell exists, but TEI lifecycle
  control is still deferred.
- PageIndex PoC milestone design.
- OS-standard path migration for config/data/cache/state/log directories.
  Keep this after the current web API/daemon bridge stabilizes.

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
npx playwright install chromium
npm test
npm run test:e2e
```

Current `web/graph-backend` smoke:

```bash
cd web
npm run dev
```

This starts the Vite dev server on `127.0.0.1:39281` and launches the Electron
shell. If a Vite server is already listening on that port, the dev runner
reuses it.

Detailed test and environment instructions live in `docs/testing.md`.
