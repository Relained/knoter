# knoter current plan

Last updated: 2026-05-21

## Current State

CLI and web frontend are now split inside one monorepo: `cli/`, `web/`, and shared root `docs/`.

Implemented backbone:

- vault/add/sync/search/get/tag/template/report/mcp command surfaces
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

## Active Decisions

- Source files are moved/copied under `sources/YYYY-MM-DD/` and referenced by path.
- Rewriting is always performed by an external LLM agent.
- `knoter` stores and validates rewritten/artifact documents; it does not generate their prose in normal `kn` commands.
- Artifact documents are indexed but excluded from default search. Use `--include-artifacts` explicitly.
- Task/workout/area/metric extraction belongs to the external agent at rewritten time.
- One template file exists per vault at `.kn/template.md`; `docs/template.md` is bundled fallback.
- `kn llm` is the only future namespace allowed to assemble prompts or call LLMs.
- Service lifecycle belongs to frontend/app packaging. CLI only exposes service
  endpoint status/probing.
- Cluster analysis belongs to frontend/app code with direct zvec access, not the
  CLI command surface.
- PageIndex is a future PoC, not current retrieval backend.

## P0 Next Work

1. Document/code structure cleanup
   - Active docs: `docs/README.md`, `docs/architecture.md`, `docs/codebase.md`, `docs/plan.md`, `docs/template.md`, `docs/testing.md`.
   - Legacy docs move under `docs/archive/`.
   - Report context internals split into small modules.

2. Template contract validation
   - [x] Validate required frontmatter fields when present.
   - [x] Validate required sections/variables contract.
   - [x] Return machine-readable `errors`, `warnings`, and `checks`.
   - [x] Keep validation local; no LLM call.

3. Signal storage contract
   - Define accepted external-agent JSON shape for task/workout/daily/area/metric.
   - Store only explicit agent output.
   - Do not infer global type/kind automatically.

4. `kn llm` plan
   - Start with prompt/context helpers.
   - Keep actual LLM run commands deferred unless explicitly needed.

## P1

- Package metadata: rename package to `knoter`, add `bin.kn`, confirm build layout.
- CJK indexing: evaluate trigram setup and preprocessor direction.
- Verification: E2E for `--dry-run`, `--tag`, `--after`, adjacent chunk merge, vector rollback.
- PageIndex PoC milestone design.

## P2

- Frontend-owned local service execution UX, including macOS local TEI defaults.
- SSE/HTTP MCP only if stdio is insufficient.

## Verification Baseline

Use these before code-affecting commits:

```bash
bun test
git diff --check
```

Detailed test and environment instructions live in `docs/testing.md`.
