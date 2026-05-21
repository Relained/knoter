# knoter

Backend CLI for vault-based personal knowledge records.

`knoter` stores user sources, external-agent rewritten documents, and generated artifacts in separate layers. It indexes rewritten/artifact documents for retrieval and exposes JSON/MCP context for external LLM agents.

## Quick Commands

```bash
bun install
bun run src/cli.ts --help
bunx tsc --noEmit
bun test
```

Optional local TEI smoke test:

```bash
scripts/test-env.sh tei-start

KN_TEI_BASE_URL=http://127.0.0.1:39280 \
KN_TEI_MODEL=<model-id> \
KN_TEI_DIM=<embedding-dimension> \
bun test tests/tei-integration.test.ts
```

On macOS, local TEI via `text-embeddings-router` is the supported path for
Metal acceleration. `kn vault create --embedding-base-url http://127.0.0.1:39280`
stores that endpoint. Container lifecycle is handled outside the CLI.

The TEI integration test reads fixtures from `KN_TESTDATA_ROOT` (default:
`../testdata` from this package), builds a Codex rewrite prompt for source ->
rewritten -> artifact output, indexes rewritten/artifact documents with the TEI
embedding model, and verifies Korean keyword plus semantic search. Set
`KN_CODEX_CLI_E2E=1` to call the real Codex CLI agent.

When `KN_TESTDATA_ROOT` exists, corpus tests and `scripts/test-env.sh setup`
include every `**/*.md` file below that directory. Non-Markdown files are not
part of the corpus.

## Current Scope

- Backend CLI package inside the monorepo.
- Frontend lives in `../web`.
- Normal `kn` commands do not call LLMs except embedding.
- External LLM agents use MCP/JSON context to rewrite sources and create artifacts.
- Package metadata is not final yet: `package.json` still uses the legacy
  package name and has no `bin.kn`.

## Command Surface

- `kn vault create|list|switch|delete|status`
- `kn add`
- `kn sync`
- `kn search`
- `kn get`, `kn get batch`
- `kn tag list|add|remove`
- `kn template get|list|validate`
- `kn report context`
- `kn mcp`
- `kn service status`

## Docs

Start with:

- `../docs/README.md`
- `../docs/architecture.md`
- `../docs/plan.md`
- `../docs/template.md`

Legacy notes are under `../docs/archive/`.
