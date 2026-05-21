# knoter testing and environment

## Env Loading

Project-local environment is centralized in repo-root `.env`.

- Bun automatically loads `.env` for `bun run` and `bun test`.
- Do not add `dotenv`.
- Shell scripts source `.env` explicitly because they use env values before
  starting Bun.
- Override the env file for scripts with `KN_ENV_FILE=/path/to/env`.

`.env` is intentionally gitignored. Keep machine-specific endpoint, runtime,
and timeout values there.

## Env Catalog

Core:

- `KN_HOME`: global kn config directory. Defaults to `~/.kn`; tests usually set
  it to an isolated temp directory.
- `KN_TESTDATA_ROOT`: markdown fixture corpus used by live tests and local test
  vault bootstrap. Defaults to repo-root `testdata/` from the `cli/` package,
  but should be set in `.env` when using private, large, or machine-specific
  test data.

Embedding provider and test vault bootstrap:

- `KN_EMBED_BASE_URL`: OpenAI-compatible embedding endpoint for script-created
  vaults.
- `KN_EMBED_MODEL`: embedding model id.
- `KN_EMBED_API_KEY`: bearer token if the endpoint requires one.
- `KN_EMBED_CONTAINER`: TEI container name used for lazy start.
- `KN_EMBED_RUNTIME`: `podman` or `docker`.

TEI container setup:

- `KN_TEI_IMAGE`: TEI image.
- `KN_TEI_PORT`: host port mapped to TEI `:80`.
- `KN_TEI_VOLUME`: named model cache volume.
- `KN_TEI_GPU`: `1` for CUDA image/device settings, otherwise `0`.

Live TEI/Codex integration tests:

- `KN_TEI_BASE_URL`: OpenAI-compatible TEI endpoint.
- `KN_TEI_MODEL`: model sent to `/v1/embeddings`.
- `KN_TEI_API_KEY`: bearer token if needed.
- `KN_TEI_DIM`: expected embedding dimension.
- `KN_CODEX_CLI_E2E`: `1` enables real Codex CLI agent execution.
- `KN_CODEX_BIN`: Codex executable name/path.
- `KN_CODEX_TIMEOUT_MS`: single Codex CLI call timeout.
- `KN_TEI_ALL_TESTDATA_TIMEOUT_MS`: full `testdata/**/*.md` corpus timeout.

## Commands

Hermetic unit/integration suite:

```bash
bun test
```

Live TEI/Codex embedding E2E:

```bash
scripts/tei-e2e-test.sh
```

Local test vault setup:

```bash
scripts/test-env.sh tei-install
scripts/test-env.sh setup
scripts/test-env.sh demo
scripts/test-env.sh teardown
```

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
