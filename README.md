# knoter

Monorepo for the knoter CLI, shared project docs, and web frontend.

## Projects

- `cli/`: TypeScript/Bun CLI, MCP server, indexing, search, report tooling, and
  the explicit `kn llm rewrite` (Codex) workflow.
- `docs/`: shared architecture, planning, testing, and artifact workflow docs.
- `web/`: React/Vite HTML workbench frontend with an Electron development shell
  and CLI-backed IPC. No web test harness currently exists; `npm run check` is
  the verification baseline.

Agent guides: root `agents.md` routes to `cli/agents.md` and `web/agents.md`.

## Local Ports

- CLI/local TEI embedding endpoint: `http://127.0.0.1:39280`
- Web Vite dev/preview server: `http://127.0.0.1:39281`

The CLI does not create or manage TEI containers. On macOS, run
`text-embeddings-router` locally for Metal acceleration and point the vault at
that OpenAI-compatible embedding endpoint.

## Common Commands

```sh
cd cli
# Current ad hoc typecheck; package metadata/check script is P1 work.
bunx tsc --noEmit
bun test
```

```sh
cd web
npm install
npm run check
npm run dev   # test vault bootstrap + Vite + Electron shell
```
