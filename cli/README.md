# knoter CLI

Legacy vault storage, search, and queued maintenance by an external agent.

## Local development

Use Bun. From the repository root:

```sh
cd cli
bun install
bun run src/cli.ts --help
```

Use the entrypoint's help for commands/options instead of a duplicated catalog.
For code changes, run `bunx tsc --noEmit` from this directory.

## Working with a vault

Use `vault init` to create a vault, place originals under its `sources/` directory,
and run `sync`. Configure `agent.backend` for actual document generation;
unconfigured agent work stays queued. Global configuration is
`~/.config/knoter/config.json`, with per-vault `config.json` overrides.

Source keyword search (`search <query> --scope sources`) works without embeddings.
Wiki semantic retrieval needs an external embedding endpoint (default
`http://127.0.0.1:39280`). On macOS, run `text-embeddings-router` separately for
Metal acceleration; the CLI does not manage containers.

Vault deletion unregisters a vault and removes its index directory, preserving
user files. Manual runs use the machine's real configuration: follow the
[operational cautions](../docs/architecture.md#verification-evidence-and-operational-cautions)
and use disposable data.

For changes, read [agents.md](agents.md); design rationale and unresolved work
live in [project memory](../docs/README.md).
