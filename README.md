# knoter

Backend CLI for vault-based personal knowledge records.

`knoter` stores user sources, external-agent rewritten documents, and generated artifacts in separate layers. It indexes rewritten/artifact documents for retrieval and exposes JSON/MCP context for external LLM agents.

## Quick Commands

```bash
bun install
bun run src/cli.ts --help
bun test
```

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
