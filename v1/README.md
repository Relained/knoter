# knoter V1

The legacy application is kept here independently of the [V2 rewrite](../v2/README.md).
Use the package guides for setup and checks:

- [CLI](cli/README.md): Bun-based vault management, indexing, search, and agent queue.
- [Electron workbench](web/README.md): desktop UI with a preload IPC bridge to the CLI and vault files.
- [Decisions and lessons](docs/architecture.md): retained design reasons, failures, and verification limits.
- [Vault templates](res/templates/workflow.md): runtime instructions seeded into new vaults.

After the move from root-level `cli/`, `web/`, and `res/`, run commands from
`v1/cli` or `v1/web`. Their sibling layout is preserved so bundled templates and
the Electron CLI bridge still resolve locally. V1 and V2 keep separate package
managers and dependency installations.

Existing vaults and `~/.config/knoter/config.json` are not migrated. Local
`.sample/` data stays at the repository root. Any external shell alias, symlink,
`KNOTER_CLI_ENTRY` override, or installed launchd job containing the old absolute
CLI path must be updated before reuse. For a previously installed sync job,
rerun `bun run src/cli.ts service install` from `v1/cli`, retaining any custom
`--interval`; this explicitly re-registers the job and is not part of verification.

Follow the [root agent guide](../agents.md) and the relevant package guide when
maintaining V1. Moving source directories does not change vault formats or
authorize in-place data migration.
