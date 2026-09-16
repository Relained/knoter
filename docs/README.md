# Project memory

Keep information that cannot be recovered reliably from the current code:
decisions and their reasons, user constraints, failures and fixes, verification
limits, and unimplemented plans. Package guides and code own implementation
details; Git history owns completed-work inventories.

| Document | Purpose |
| --- | --- |
| [Decisions and lessons](architecture.md) | Legacy CLI/web boundaries, UI failure records, operational cautions, and unresolved work |
| [Desktop rewrite brief](plan/desktop-rewrite.md) | English handoff: product intent, library/format choices, macOS/Windows constraints, and implementation gates |

For setup, commands, and package-specific rules, use the
[root guide](../agents.md), [CLI guide](../cli/agents.md),
[web guide](../web/agents.md), and [rewrite guide](../v2/agents.md).
The [prototype README](../v2/README.md) holds its manual verification evidence
and tool limitations.

[res/templates/workflow.md](../res/templates/workflow.md) is a runtime contract
seeded into vaults, not ordinary documentation. Preserve existing users'
customized vault contracts when changing seed templates.

Do not add file maps, API/command catalogs, copied type definitions, routine
PASS logs, or completed-feature checklists here. Record a failed attempt with
its date, scope, cause, resolution or remaining uncertainty. Keep historical
verification limits dated; do not present them as current defects. Consolidate
related decisions instead of opening another status document.
