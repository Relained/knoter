# knoter testing and environment

## Env Loading

CLI environment is centralized in package-local `cli/.env` by default.

- Bun automatically loads `.env` from the current package directory for
  `bun run` and `bun test`; the documented CLI commands assume `cwd=cli/`.
- Do not add `dotenv`.
- CLI shell scripts source `cli/.env` explicitly because they use env values
  before starting Bun.
- Override the env file for scripts with `KN_ENV_FILE=/path/to/env`.

`.env` is intentionally gitignored. Keep machine-specific endpoint, model, and
timeout values there.

## Env Catalog

Core:

- `KN_HOME`: global kn config directory. Defaults to `~/.kn`; tests usually set
  it to an isolated temp directory.
- `KN_TESTDATA_ROOT`: markdown fixture corpus used by live tests and local test
  vault bootstrap. From `cli/`, the default is `../testdata`, i.e. the
  repository-root `testdata/` directory. Set it in `.env` when using private,
  large, or machine-specific test data.

Embedding provider and test vault bootstrap:

- `KN_EMBED_BASE_URL`: OpenAI-compatible embedding endpoint for script-created
  vaults. Defaults to `http://127.0.0.1:39280`.
- `KN_EMBED_MODEL`: embedding model id.
- `KN_EMBED_API_KEY`: bearer token if the endpoint requires one.
- `KN_TEI_PORT`: local `text-embeddings-router` port for
  `scripts/test-env.sh tei-start`. Defaults to `39280`.

Live TEI/Codex integration tests:

- `KN_TEI_BASE_URL`: OpenAI-compatible TEI endpoint. Defaults to
  `http://127.0.0.1:39280` in `scripts/tei-e2e-test.sh`.
- `KN_TEI_MODEL`: model sent to `/v1/embeddings`.
- `KN_TEI_API_KEY`: bearer token if needed.
- `KN_TEI_DIM`: expected embedding dimension.
- `KN_CODEX_CLI_E2E`: `1` enables real Codex CLI agent execution.
- `KN_CODEX_BIN`: Codex executable name/path.
- `KN_CODEX_TIMEOUT_MS`: single Codex CLI call timeout.
- `KN_TEI_ALL_TESTDATA_TIMEOUT_MS`: full `testdata/**/*.md` corpus timeout.

Web:

- Vite dev and preview use `http://127.0.0.1:39281`.
- Playwright E2E uses the same port and starts the Vite dev server through
  `webServer` in `web/playwright.config.js`.

## Commands

CLI hermetic unit/integration suite:

```bash
cd cli
bun test
```

TypeScript check:

```bash
cd cli
bunx tsc --noEmit
```

This is the current ad hoc check command. `cli/package.json` does not yet have a
package-local `check` script or pinned TypeScript dev dependency; that belongs
to the P1 package metadata cleanup.

Live TEI/Codex embedding E2E:

```bash
cd cli
scripts/tei-e2e-test.sh
```

Local test vault setup:

```bash
cd cli
scripts/test-env.sh tei-start
scripts/test-env.sh setup
scripts/test-env.sh demo
scripts/test-env.sh teardown
```

For macOS Metal acceleration, run local TEI in one terminal:

```bash
cd cli
scripts/test-env.sh tei-start
```

Then run tests or create the test vault from another terminal:

```bash
cd cli
scripts/tei-e2e-test.sh
scripts/test-env.sh setup
```

The CLI stores and calls an embedding server API endpoint only. It does not
create, start, or own TEI containers. Local service lifecycle is future
packaged-app work and is not implemented in the current `web/` renderer.

Endpoint health checks:

```bash
cd cli
bun run src/cli.ts service status --check
bun run src/cli.ts vault status --check-providers
```

`service status --check` is the preferred narrow endpoint probe. `vault status
--check-providers` remains useful when the same output should include vault
metadata and provider health.

Testdata corpus behavior:

- `scripts/test-env.sh setup` runs `kn add "$KN_TESTDATA_ROOT" --recursive`, so
  it indexes every `**/*.md` file under that root.
- `tests/tei-integration.test.ts` has a live corpus test that scans
  `new Bun.Glob("**/*.md")`, creates source rows under `sources/testdata/`,
  creates rewritten fixtures under `rewritten/testdata/`, embeds all generated
  chunks through TEI, then checks FTS, zvec fetch, semantic search, and hybrid
  search.
- If `KN_TESTDATA_ROOT` does not exist, the corpus tests print a skip reason and
  return successfully. The smaller shared TEI fixture still runs when
  `KN_TEI_BASE_URL` is set.

Web verification:

```bash
cd web
npx playwright install chromium
npm test
npm run test:e2e
```

`npm run test:e2e` launches Chromium against `http://127.0.0.1:39281` and checks
the workspace shell, command palette, Settings floating window, split pane, and
floating window creation without console/page errors.

## Template Delivery To Agents

`docs/template.md` is not read magically by the model. It reaches an external
agent through `kn`/MCP payloads:

1. `src/core/template.ts` resolves the effective template:
   - vault override: `<vault_root>/.kn/template.md`
   - fallback: repo `docs/template.md`
2. `kn template get` returns the resolved template content and metadata.
3. `kn report context --date YYYY-MM-DD` embeds the resolved template object in
   the JSON context bundle under `template`.
4. MCP exposes the same paths through `kn_template_get` and
   `kn_report_context`.
5. The external agent reads that template text, then uses `kn`/MCP retrieval
   such as search/get/report context to decide whether to create new artifacts
   or update existing artifact documents.

The current fallback template is an artifact workflow contract, not a single
daily-report-only output contract.
