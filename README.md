# knoter

Monorepo for the knoter CLI, shared project docs, and web frontend.

## Projects

- `cli/`: TypeScript/Bun CLI — vault management, indexing, agent work queue,
  search, launchd scheduling. `kn sync` spawns the configured external agent
  (codex/claude CLI) which maintains vault artifacts plus their HTML displays.
- `res/templates/`: vault seed content (workflow contract + per-artifact
  templates with default HTML), copied into each vault at `kn vault init`.
- `docs/`: shared architecture, planning, and testing docs.
- `web/`: React/Vite HTML workbench frontend with an Electron development shell
  and CLI/fs-backed IPC. No web test harness currently exists; `npm run check`
  is the verification baseline.
- [`v2/`](v2/README.md): isolated frontend rewrite with interactive wiki, sources,
  chat, tasks, and calendar. Uses a replaceable mock API; no backend is connected.

Agent guides: root `agents.md` routes to `cli/agents.md`, `web/agents.md`, and
`v2/agents.md`.

## Local Ports

- CLI/local TEI embedding endpoint: `http://127.0.0.1:39280`
- Web Vite dev/preview server: `http://127.0.0.1:39281`
- New frontend prototype: `http://127.0.0.1:39282` (`cd v2`, then `npm run dev`)

The CLI does not create or manage TEI containers. On macOS, run
`text-embeddings-router` locally for Metal acceleration and point the vault at
that OpenAI-compatible embedding endpoint.

## Common Commands

```sh
cd cli
# Current ad hoc typecheck; package metadata/check script is P1 work.
bunx tsc --noEmit
```

```sh
cd web
npm install
npm run check
```

The CLI/web test harnesses were removed during the queue-architecture rewrite;
manual smoke steps live in `docs/testing.md`.
