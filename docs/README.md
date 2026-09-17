# Project memory

Keep what cannot be recovered reliably from code: design reasons, user
constraints, failures and remedies, verification limits, and unimplemented plans.
READMEs own setup/use instructions, agents files own work rules, and code owns
implementation details. Git history owns completed-work inventories.

| Document | Purpose |
| --- | --- |
| [V1 decisions and lessons](../v1/docs/architecture.md) | Legacy boundaries, UI failures, operational cautions, and unresolved work |
| [Desktop rewrite brief](plan/desktop-rewrite.md) | English handoff: product intent, library/format choices, platform constraints, and implementation gates |
| [V2 wiki worker demo plan](plan/wiki-worker-demo.md) | Agreed demo scope: main-owned source discovery, durable queue, OS service, Codex CLI, and default skill |

Use the [project README](../README.md) for package entry points and the
[root agent guide](../agents.md) for work rules. The
[prototype README](../v2/README.md#failure-evidence-and-verification-limits)
retains its failure evidence and unverified paths.

[v1/res/templates/workflow.md](../v1/res/templates/workflow.md) is a runtime contract
seeded into vaults; preserve existing users' customized copies.

Do not duplicate file maps, API/type catalogs, routine PASS logs, or completed
checklists. Record failures with date, scope, cause, and resolution or remaining
uncertainty; do not present dated verification limits as new defects. Consolidate
related decisions instead of opening more status documents.
