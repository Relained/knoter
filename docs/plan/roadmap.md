# knoter roadmap (decisions and planned work)

Last updated: 2026-06-10

Active decisions and the P0–P2 work plan. The implemented current state lives
in `docs/plan/progress.md`; the workbench design-defect fix plan lives in
`docs/plan/web-fix-plan.md`.

## Active Decisions

- Target model is Source / Artifact. `rewritten` is a legacy alias for
  agent-authored indexed knowledge until the storage/search migration removes it.
- Source files are moved/copied under `sources/YYYY-MM-DD/` and referenced by path.
- `knoter` stores and validates source/artifact documents; it does not generate
  their prose in normal `kn` commands.
- Artifact display is HTML-first, with a separate plain text search projection
  in the target model. Untrusted agent HTML renders only through the sandboxed
  iframe or the sanitized external window path.
- Default retrieval target is `artifact.kind: llm-wiki`, implemented in the
  CLI: default search/report retrieval covers non-artifact layers plus
  llm-wiki artifacts (date-scope exempt in report retrieval); other artifact
  kinds need explicit `--include-artifacts`. Legacy rewritten stays indexed
  and default-searchable until the storage migration removes it.
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
- Branch layout (restructured 2026-06-10): single long-lived branch `dev`
  (default on origin). Topic branches have free-form names (prefix grouping
  like `features/`, `webs/`, `backs/`, `refactoring/` is optional, not
  required) and merge into `dev` via PR. There is no `main` branch for now;
  a stable/release branch may be reintroduced later. Legacy branches were
  triaged and deleted (`cli/document-graph` was patch-equivalent to the
  document-graph work already in `dev`).
- OS-standard config/cache/state/log directory migration is intentionally
  deferred. Current test-generated DB/cache output is kept under project-local
  ignored directories where tests need persistent filesystem artifacts.
- Graph 2D/3D renderer implementation is deferred until the web API/daemon
  bridge can provide real graph payloads (`document_graph_edges`) from vault
  data. `graph.get` currently returns an edge-less Explorer projection.

## P0 Current Work

0. Midterm-demo workbench features (design: `docs/design/widget-bar.md`)
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

1. Workbench/IPC integration (design: `docs/design/web-commands.md`)
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
   - [x] Keybinding system: chord→command bindings over the command registry
     with defaults (`Mod+K` palette, `Mod+S` note save, tab cycling), settings
     recorder UI, palette shortcut hints; Escape no longer opens the palette.
   - [x] Vault onboarding: Create Vault modal (auto-opens when no vault
     exists) backed by `vault.bootstrap` — `kn vault create` + switch,
     `kn template scaffold` (bundled llm-wiki/calendar/todo/kanban document
     templates with default HTML pairs), optional bulk source folder import
     (`kn add --recursive`), then sync.
   - [ ] Manual GUI smoke pass of the checklist in
     `docs/design/web-commands.md`.
   - [ ] Decide settings persistence: expose the JSONC config-file bridge from
     preload or commit to localStorage-only for now.
   - [x] Design-defect fixes from the large-app GUI comparison review — all
     16 defects in `docs/plan/web-fix-plan.md` are implemented (layout bugs,
     palette keyboard navigation + MRU, dialog dismissal + focus trap, theme
     passthrough, token cleanup, long-op progress, status chip, unread badge
     semantics, tab keep-alive, ARIA patterns). The manual GUI smoke pass is
     still outstanding (tracked with the other smoke-pass items above).

2. Source / Artifact model migration
   - [ ] Add Source metadata fields: `media_type`, `privacy`, `time_scope`,
     `wiki_policy`, `extraction_status` (the source modal UI already drafts
     these values).
   - [ ] Add source extraction projection storage for PDF/OCR/text/image
     captions and confidence/page/region metadata.
   - [ ] Add artifact display/search projection split: HTML display, plain-text
     search projection, heading outline, source references.
   - [x] Promote `artifact.kind: llm-wiki` to the default retrieval target
     (search + report retrieval; other artifact kinds stay behind
     `--include-artifacts`).
   - [ ] Migrate `rewritten` storage/search behavior to legacy alias or remove it
     after fixture and report-context updates. Progress: `kn llm rewrite` no
     longer authors rewritten notes (artifact-first contract, template v5
     with per-artifact scenario template files); existing rewritten
     storage/indexing remains as the legacy alias.

3. Web cache rebuild
   - [ ] Rebuild project-local web cache from CLI/vault source data
     (recoverable projection; CLI metadata stays authoritative).

4. Signal storage contract
   - Define accepted external-agent JSON shape for task/workout/daily/area/metric.
   - Store only explicit agent output.
   - Do not infer global type/kind automatically.

5. `kn llm` follow-up
   - [x] `kn llm rewrite` with Codex CLI, isolated workspace, vault import.
   - [x] Artifact-first rewrite contract: agent updates `artifacts/llm-wiki.md`
     plus scenario artifacts (vault artifacts seeded into the workspace);
     legacy `rewritten.md` output is imported for compatibility only.
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
