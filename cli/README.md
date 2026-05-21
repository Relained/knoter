# knoter

Backend CLI for vault-based personal knowledge records.

`knoter` stores user sources, external-agent rewritten documents, and generated artifacts in separate layers. It indexes rewritten/artifact documents for retrieval and exposes JSON/MCP context for external LLM agents.

## Quick Commands

```bash
bun install
bun run src/cli.ts --help
bun test
```

Optional local TEI smoke test:

```bash
KN_TEI_BASE_URL=http://127.0.0.1:8080 \
KN_TEI_MODEL=<model-id> \
KN_TEI_DIM=<embedding-dimension> \
bun test tests/tei-integration.test.ts
```

The TEI integration test uses `testdata/2026-04-16.md`, builds a Codex rewrite
prompt for source -> rewritten -> artifact output, indexes rewritten/artifact
documents with the TEI embedding model, and verifies Korean keyword plus semantic
search. Set `KN_CODEX_CLI_E2E=1` to call the real Codex CLI agent.

## Current Scope

- Backend CLI only.
- Frontend is deferred to `../knoter-web`.
- Normal `kn` commands do not call LLMs except embedding.
- External LLM agents use MCP/JSON context to rewrite sources and create artifacts.

## Docs

Start with:

- `docs/README.md`
- `docs/architecture.md`
- `docs/plan.md`
- `docs/template.md`

Legacy notes are under `docs/archive/`.
