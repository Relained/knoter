# knoter current plan

Last updated: 2026-05-08

## Current State

Backend CLI is the active scope. Frontend work is deferred to a later context in `../knoter-web`.

Implemented backbone:

- vault/add/sync/search/get/tag/template/report/mcp command surfaces
- source/rewritten/artifact DB metadata
- source metadata-only ingest
- rewritten/artifact chunking, FTS, vector indexing
- artifact default search exclusion
- explicit raw `kind` storage without auto type inference
- OpenAI-compatible embedding provider path
- CJK chunking/search fallback improvements
- MCP stdio tools for template/report/rewrite/add-note
- `kn report context` JSON bundle with previous 7-day continuity

## Active Decisions

- Source files are moved/copied under `sources/YYYY-MM-DD/` and referenced by path.
- Rewriting is always performed by an external LLM agent.
- `knoter` stores and validates rewritten/artifact documents; it does not generate their prose in normal `kn` commands.
- Artifact documents are indexed but excluded from default search. Use `--include-artifacts` explicitly.
- Task/workout/area/metric extraction belongs to the external agent at rewritten time.
- One template file exists per vault at `.kn/template.md`; `docs/template.md` is bundled fallback.
- `kn llm` is the only future namespace allowed to assemble prompts or call LLMs.
- `schedule` is a packaging/install milestone, not an active timer-management command direction.
- PageIndex is a future PoC, not current retrieval backend.

## P0 Next Work

1. Document/code structure cleanup
   - Active docs: `docs/README.md`, `docs/architecture.md`, `docs/plan.md`, `docs/template.md`.
   - Legacy docs move under `docs/archive/`.
   - Report context internals split into small modules.

2. Template contract validation
   - Validate required frontmatter fields when present.
   - Validate required sections/variables contract.
   - Return machine-readable `errors` and `warnings`.
   - Keep validation local; no LLM call.

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

- launchctl/systemd service templates for scheduled maintenance.
- Container `run` support when `container.image` is configured.
- SSE/HTTP MCP only if stdio is insufficient.

## Verification Baseline

Use these before code-affecting commits:

```bash
bun test
git diff --check
```

Known caveat:

- Avoid running `bun test tests/korean.test.ts` concurrently with full `bun test`; they share fixture paths and can false-fail under concurrent zvec/SQLite access.
