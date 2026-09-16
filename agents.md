# knoter root agent guide

## Scope and routing

Read the relevant guide before planning or editing:
[CLI](cli/agents.md), [legacy Web/Electron](web/agents.md), or
[isolated rewrite](v2/agents.md). Root rules apply throughout the repository;
package rules govern their own files. Read every affected guide for cross-package
work and preserve the stricter boundary unless the user directs otherwise.
Legacy Web rules do not govern V2.

Use [project memory](docs/README.md) for the smallest relevant set of decisions,
failures, and plans. READMEs own setup/use instructions; agents files own work
rules. Keep code maps, copied APIs/types, and completed-feature inventories out
of both. Record dated failures and verification limits instead of routine PASS
logs; preserve decisions and user constraints when compressing documents.

## Work and verification

- Keep scope and acceptance criteria explicit; prefer small patches and existing
  patterns. Preserve architecture and user decisions unless a change is authorized.
- Do not discard unrelated user work. Treat source files and existing vaults as
  user data, including during manual verification.
- Update the owning guide or decision record when a contract changes; link to
  shared explanations rather than copying them into each package.
- For code changes, run the package README's check command and the narrowest
  relevant manual checks; broaden for storage, retrieval, persistence, or UI
  interaction changes. Use disposable data. Report exact checks and remaining
  uncertainty; never imply that an unrun check passed.
- Run `git diff --check`. Ordinary documentation changes need a read-through and
  link checks, not an application build.
- Test automation and CI were deferred by the user's 2026-09-16 instruction;
  reintroduce them only when requested. Static checks/builds remain required.
- [res/templates/workflow.md](res/templates/workflow.md) is executable agent
  policy, not ordinary prose. Keep the CLI work prompt consistent with changes;
  preserve customized copies in existing vaults and document new-vault scope.
- Report the change's intent, affected files, validation, and material risks.

## Git

- `dev` is the only long-lived branch and the default base; there is no `main`.
  Start topic branches from `dev` unless another base is authorized, or continue
  an active topic branch that matches the task.
- Topic names are otherwise free-form. Never use `dev/...`: Git cannot keep both
  a `dev` ref and refs beneath it.
- Keep CLI and Web implementation on separate topic branches unless the change
  is inherently cross-package. Merge into `dev` through a PR, or a local
  `--no-ff` merge when working without the remote.
- Commit related changes in small verified units. Before committing, inspect
  `git branch --show-current` and `git status --short --branch`.
- Never rewrite, reset, or discard user changes without explicit instruction.
  Do not push or delete remote branches unless requested.
- Correct branch history locally first: create from the intended base and
  cherry-pick/reapply only the required commits, then verify. Ask before any
  destructive remote correction.
