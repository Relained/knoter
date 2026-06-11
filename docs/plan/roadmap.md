# knoter roadmap (decisions and planned work)

Last updated: 2026-06-11

Active decisions and the P0–P2 work plan. The implemented current state lives
in `docs/plan/progress.md`; the workbench design-defect fix plan lives in
`docs/plan/web-fix-plan.md`.

## Active Decisions

- Model is Source / Artifact. The legacy `rewritten` layer is fully removed
  (schema migration deletes remaining rows).
- A vault is a plain directory: `{templates, sources, artifacts, .db}` +
  optional `config.json`. Default location `~/Documents/<name>`, custom paths
  allowed; multiple vaults are registered in the global config.
- Configuration is file-based only: `~/.config/knoter/config.json` (vault
  registry, defaultVaultDir, agent backends, embedding defaults, sync
  interval) with per-vault `config.json` overrides. `KN_*` env vars are
  discarded.
- `knoter` stores and indexes documents; it never generates prose itself.
  LLM work is done by the external agent process (codex/claude CLI) that
  `kn sync` spawns in the vault working directory. The agent follows the
  vault's `templates/workflow.md` contract and maintains artifact `.md` +
  same-path `.html`.
- Source changes are detected by sync, queued in `agent_queue` (one pending
  item per source path; deletes cancel unprocessed adds), and handed to the
  agent. `kn service install` registers periodic `kn sync` via launchd.
- Vector indexing is limited to `artifact.kind: llm-wiki`; everything else is
  FTS keyword-only. Semantic/hybrid search is therefore llm-wiki-scoped
  (`kn search` default), with `--scope artifacts|sources|all` keyword search.
- The tag system stays removed: agent retrieval relies on hybrid search and
  layer/kind policy.
- Artifact display is HTML-first. Untrusted agent HTML renders only through
  the sandboxed iframe or the sanitized external window path. HTML files are
  never indexed.
- MCP server / skill-document exposure is a future plan only; the previous
  MCP implementation was discarded and deleted.
- Task/workout/area/metric extraction belongs to the external agent when it
  updates artifacts.
- Cluster analysis belongs to a future app/frontend layer with direct zvec
  access, not the CLI command surface.
- PageIndex is a future PoC, not current retrieval backend.
- Branch layout (restructured 2026-06-10): single long-lived branch `dev`
  (default on origin). Topic branches have free-form names (prefix grouping
  like `features/`, `webs/`, `backs/`, `refactoring/` is optional, not
  required) and merge into `dev` via PR. There is no `main` branch for now.
- Graph 2D/3D renderer implementation is deferred until the web bridge can
  provide real graph payloads (`document_graph_edges`). `graph.get` currently
  returns an edge-less Explorer projection.

## P0 Current Work

1. Agent loop hardening
   - [x] `agent_queue`/`sync_state` storage, `kn sync` index→queue→agent→
     re-index flow, launchd `kn service install`.
   - [ ] Real-agent run validation: configure `agent.backend` (codex/claude),
     process a queued source end-to-end, and review the resulting llm-wiki /
     scenario artifact / HTML quality against `templates/workflow.md`.
   - [ ] Decide agent stdout/result capture format (currently inherited to the
     sync log) and surface a per-run summary in `kn sync` output.
   - [ ] Reintroduce a test harness for sync/queue/store behavior (the previous
     suite was removed with the rewrite).

2. Source / Artifact model follow-up
   - [ ] Add Source metadata fields: `media_type`, `privacy`, `time_scope`,
     `wiki_policy`, `extraction_status` (the source modal UI already drafts
     these values).
   - [ ] Add source extraction projection storage for PDF/OCR/text/image
     captions and confidence/page/region metadata.

3. Workbench alignment
   - [ ] Manual dev-shell smoke pass of the workbench flows (`npm run dev`)
     against the new vault layout (templates/ browsing, source drop →
     status-triggered indexing, llm-wiki search).
   - [ ] Decide settings persistence: expose the JSONC config-file bridge from
     preload or commit to localStorage-only for now.
   - [ ] Web cache rebuild: project-local web cache from CLI/vault source data
     (recoverable projection; CLI metadata stays authoritative).

## P1

- Package metadata: rename package to `knoter`, add `bin.kn`, add package-local
  `check` script, pin TypeScript, confirm build layout. (`bin.kn` also makes
  the agent's `kn search` calls and the launchd plist independent of repo
  paths.)
- CJK indexing: evaluate trigram setup and preprocessor direction.
- Verification: rebuild the CLI test suite around the final architecture
  (sync, queue merge rules, vault-store rollback, scope search, config merge).
  Reintroduce a web test harness for the workbench.
- Linux/systemd support for `kn service`.
- Packaged-app integration design for local TEI start/stop/status using the
  CLI's external service boundary.
- Switch web `graph.get` from the Explorer projection to the CLI
  `document_graph_edges` table when the bridge is ready.
- PageIndex PoC milestone design.

## P2

- MCP server / skill-document exposure for external agent ecosystems
  (re-design from scratch; the old implementation is deleted).
- Packaged-app-owned local service execution UX, including macOS local TEI
  defaults.
