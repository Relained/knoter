
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## zvec (`@zvec/zvec`)

Local vector DB library. See type definitions at `node_modules/@zvec/zvec/src/index.d.ts`.

### Core API

- `ZVecCreateAndOpen(path, schema)` — create and open a collection
- `ZVecOpen(path)` — open an existing collection
- `collection.insertSync()` / `upsertSync()` / `deleteSync()` / `querySync()` / `fetchSync()`
- `collection.destroySync()` — delete a collection

### Schema gotchas

- **Sparse vector fields are not-nullable**: you must always provide a value when inserting. Use `{}` for an empty sparse vector.
- **Nullable scalar fields**: even with `nullable: true`, some types like STRING may error on actual `null`. Pass an empty string `""` instead.
- **Nullable ARRAY_STRING fields**: same as above — use `[]` instead of `null`.
- Embedding dimensions vary by model: `nomic-embed-text` = 768, `bge-m3` = 1024.
- **Timestamps**: stored as Unix epoch **milliseconds** (INT64). Use `Date.now()` / `Date.getTime()` directly.

### Filter expression syntax

zvec filters use a SQL-like grammar. Supported operators:

- Comparison: `=`, `!=`, `<`, `>`, `<=`, `>=`
- Logical: `AND`, `OR`, `NOT`
- Other: `IN`, `BETWEEN`, `LIKE`
- **Array (ARRAY_*) fields only**: `CONTAIN_ANY`, `CONTAIN_ALL`
  ```
  tags CONTAIN_ANY ("linux", "rust")    -- matches if tags has "linux" or "rust"
  tags CONTAIN_ALL ("linux", "rust")    -- matches if tags has both
  ```
- `ARRAY_CONTAINS()`, `CONTAINS()`, `array_contains()` etc. are **NOT supported**.
- When passing `filter` to `querySync()`, omit the `filter` key entirely if no filter is needed. Do not pass `undefined` or an empty string — both can cause errors.

### Index types

- `HNSW` — ANN search for dense vectors. `metricType`: `L2`, `IP`, `COSINE`.
- `FLAT` — brute-force search.
- `IVF` — cluster-based search.
- `INVERT` — for scalar field filtering and range queries. Options: `enableRangeOptimization`, `enableExtendedWildcard`.

## Architecture: Dual Storage

This project uses **zvec + SQLite** side by side. They serve different roles:

| Layer | Purpose | Store |
|-------|---------|-------|
| Vector search | Semantic + sparse (BM25) similarity ranking | zvec (`schema.ts`) |
| Metadata management | Note/chunk/tag CRUD, aggregation, change detection, FTS5 keyword search, transactional consistency | SQLite via `bun:sqlite` (`db.ts`) |

- Each vault has its own zvec index AND its own SQLite DB at `<vault_root>/.kn/meta.db`.
- The zvec vector ID and `chunks.id` in SQLite are the same value — they share the chunk ID as a join key.
- When indexing a note: write to SQLite first (source of truth), then to zvec.
- SQLite provides `ON DELETE CASCADE` — deleting a note auto-removes its chunks and tags.
- SQLite FTS5 uses external content mode (`content=chunks`) with auto-sync triggers — no manual FTS maintenance needed.
- FTS5 default tokenizer does **not** handle Korean (CJK) well. For Korean full-text search, consider adding `tokenize="unicode61"` or an ICU tokenizer in the future.
