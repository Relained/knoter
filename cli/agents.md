# knoter CLI agent guide

Apply the [root rules](../agents.md). Use Bun and existing Bun-native APIs;
setup and the verification command live in [README.md](README.md).
Read [legacy decisions](../docs/architecture.md) before changing orchestration,
retrieval, or storage; those decisions are separate from the V2 rewrite.

## Boundaries to preserve

- The CLI stores/indexes/queues; external agents generate prose. Keep its scope
  to vault, sync, search, and service operations unless a new direction is assigned.
  Do not restore retired layers, tags, MCP, or environment-based configuration.
- Only `llm-wiki` artifacts are embedded; other content uses keyword retrieval.
  HTML is presentation, never indexed evidence.
- Source originals are user-owned. Vault deletion may remove indexes/registration,
  not source files. Read-only search/status may index but must not run the agent.
- Route note CRUD through `VaultStore`; commands must not duplicate chunking,
  embedding, or persistence. SQLite metadata is authoritative; zvec IDs must
  match chunk IDs. Write metadata, then vectors, then mark synced; preserve the
  prior note/chunk snapshot on vector failure.
- Keep at most one pending queue item per source path. A deletion cancels an
  unprocessed addition; do not duplicate work when source events merge.
- Changes to [the vault workflow](../res/templates/workflow.md) affect new vaults;
  preserve existing copies and keep agent prompt assembly consistent.

## zvec integration cautions

These details are easy to miss when changing storage or embedding models:

- Create collections with `ZVecCreateAndOpen`; open existing ones with `ZVecOpen`.
  Consult the installed package's types for the exact API.
- Nullable scalar/string fields may reject actual `null`; use `""` or `[]` as
  appropriate rather than assuming the declared nullability works.
- Dimensions depend on the embedding model; unknown models need an explicit
  `--dim` at vault initialization. Keep timestamps in Unix epoch milliseconds.
- Omit the `filter` key entirely when no filter is needed.

## Change discipline

Split multi-module work or patches exceeding roughly 2,000 changed lines into
reviewable units. Require objective verification or an explicit test-impact
note; do not present known critical/high correctness issues as complete.
User-facing changes need a rollback path or a reason they are low risk.
Follow the [manual verification guidance](../docs/architecture.md#verification-evidence-and-operational-cautions),
including endpoint-down and real-agent limits; a noop run is not LLM validation.

Only when multiple agents are explicitly used: pair each Worker with a Fast
Analyzer before implementation; its patch advances after that Analyzer's PASS.
Give the Final Analyzer changed files, checks run, and the issue-report format,
not prior rationale. Reopen only blocking issues identified by the Analyzer.
