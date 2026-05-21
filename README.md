# knoter

Monorepo layout for the knoter CLI, shared project docs, and web frontend.

## Projects

- `cli/`: TypeScript/Bun CLI, MCP server, indexing, search, and report tooling.
- `docs/`: shared architecture, planning, testing, and artifact workflow docs.
- `web/`: React/Vite workspace frontend with Electron-oriented build guidance
  and Playwright smoke coverage.

## Local Ports

- CLI/local TEI embedding endpoint: `http://127.0.0.1:39280`
- Web Vite dev/preview server: `http://127.0.0.1:39281`

The CLI does not create or manage TEI containers. On macOS, run
`text-embeddings-router` locally for Metal acceleration and point the vault at
that OpenAI-compatible embedding endpoint.

## Common Commands

```sh
cd cli
bunx tsc --noEmit
bun test
```

```sh
cd web
npm install
npm test
npm run test:e2e
```
