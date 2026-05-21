# knoter

Monorepo layout for the knoter CLI and web frontend.

## Projects

- `cli/`: TypeScript/Bun CLI, MCP server, indexing, search, and report tooling.
- `web/`: React/Vite workspace frontend imported from `knoter-web`.

## Common Commands

```sh
cd cli
bun test
```

```sh
cd web
npm install
npm run check
```
