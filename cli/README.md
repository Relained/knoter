# knoter

Backend CLI for vault-based personal knowledge records.

`knoter` stores user sources and agent-generated artifacts in separate
layers, indexes them for retrieval, and queues source changes for an external
maintenance agent. `kn sync` (run periodically by the OS service or manually)
hands the queue to the configured agent backend (codex/claude CLI), which
maintains `artifacts/` markdown + HTML directly in the vault.

## Quick Commands

```bash
bun install
bun run src/cli.ts --help
# Current ad hoc typecheck; package metadata/check script is P1 work.
bunx tsc --noEmit
```

## Vault Layout

```
<vault>/                    # default ~/Documents/<name>, or --path
  config.json               # optional override of the global config
  templates/                # workflow.md contract + per-artifact templates (seeded at init)
  sources/                  # user originals (evidence only)
  artifacts/                # agent-maintained .md + same-path .html
  .db/                      # meta.db, vectors, vault.lock
```

Configuration is file-based only: `~/.config/knoter/config.json` (vault
registry, agent backends, embedding defaults, sync interval) plus the
per-vault override. No environment variables.

## Command Surface

- `kn vault init <name> [--path <dir>]` — create layout + seed templates;
  `list | switch | delete | status` (status triggers an index-only sync;
  delete removes only `.db/` and the registry entry)
- `kn sync [--full] [--no-agent] [--reconcile]` — index → queue source
  changes → spawn the agent backend → re-index → complete queue items
- `kn search <q> [--mode hybrid|semantic|keyword] [--scope llm-wiki|artifacts|sources|all]`
  — default scope `llm-wiki` (the only embedded document); other scopes are
  keyword-only
- `kn service install [--interval <min>] | uninstall | status [--check]` —
  macOS launchd registration for periodic `kn sync`, endpoint probe

The CLI calls no LLM API itself (embedding endpoint only). On macOS, run
`text-embeddings-router` locally for Metal acceleration (default endpoint
`http://127.0.0.1:39280`).

## Docs

Start with:

- `agents.md` (agent work guide for this package)
- `../docs/README.md`
- `../docs/architecture.md`
- `../res/templates/workflow.md` (the seeded agent contract)

Legacy decisions and failure records are consolidated in `../docs/architecture.md`;
implementation history remains in Git.
