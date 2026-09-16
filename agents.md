# knoter Root Agent Guide

Last updated: 2026-06-10
Project: `Documents/knoter`
Language for this file: English

This is the root routing guide for agent work in the `knoter` monorepo. It is
intentionally short. Package-specific instructions are authoritative for their
own areas and must be read before changing code in those areas.

## Required Package Guides

Before doing package-specific work, read the matching guide:

- CLI/MCP/indexing/search/agent-queue work: `cli/agents.md`
- Web/frontend/Electron work: `web/agents.md`
- Isolated rewrite under `v2/`: `v2/agents.md` (legacy web rules describe `web/`).

If a task touches both packages, read both guides before planning or editing.
When package guides conflict, follow the guide for the files being changed. For
cross-package behavior, preserve the stricter constraint unless the user
explicitly approves a different direction.

## Repository Map

| Path | Role |
| --- | --- |
| `cli/` | Bun/TypeScript CLI: vault management, indexing, agent work queue, search, launchd scheduling. |
| `web/` | React/Vite HTML workbench renderer plus Electron development shell with CLI/fs-backed IPC. |
| `v2/` | Isolated React frontend rewrite with a replaceable mock service adapter. |
| `res/templates/` | Vault seed content: workflow contract + per-artifact templates (markdown + default HTML). |
| `docs/` | Shared architecture, codebase, planning, and testing documentation. |
| `testdata/` | Markdown fixture corpus for manual smoke runs. |
| `README.md` | Root project overview. |

## Shared Documentation

Read the smallest relevant set under `docs/` before larger changes:

- `docs/architecture.md` — product model and boundary source of truth.
- `docs/codebase.md` — code reading entry point for both packages.
- `docs/testing.md` — verification commands, config files, manual smoke flow.
- `docs/plan/progress.md` — implemented current state and verification baseline.
- `docs/plan/roadmap.md` — active decisions and P0–P2 planned work.
- `res/templates/workflow.md` — the agent workflow contract seeded into every
  vault's `templates/workflow.md` by `kn vault init`. It is runtime content,
  not prose documentation; changing it changes agent behavior for new vaults.

## Shared Rules

- Keep changes scoped to the user's request.
- Prefer existing patterns and local helper APIs over new abstractions.
- Do not rewrite architecture or user decisions without explicit approval.
- Update shared docs when behavior or contracts change across packages.
- Run the narrowest relevant verification first, then broaden when touching
  shared behavior, persistence, storage, retrieval, or UI interaction.
- Never claim verification that was not actually run. If a command cannot run,
  document the reason.

## Git Management

- Branch model (current): single long-lived branch `dev`.
  - `dev` is the default branch and the only long-lived branch. There is no
    `main` for now; a stable/release branch may be reintroduced later.
  - Topic branches start from `dev` and merge back into `dev` through a PR
    (use a local `--no-ff` merge when working without the remote).
  - Topic branch names are free-form. Prefix grouping such as
    `features/<name>`, `webs/<name>`, `backs/<name>`, `refactoring/<name>` is
    a useful convention, not a requirement.
- Do not use branch names under `dev/...` when a local or remote `dev` branch
  exists. Git refs cannot cleanly contain both `dev` and `dev/<name>` at the
  same time.
- Branch new work from `dev` unless the user explicitly approves a different
  base. Continue on an existing active topic branch when it already matches
  the requested work.
- Keep CLI and web implementation commits on separate topic branches unless
  the change is inherently cross-package.
- Commit related changes in small, reviewable units after appropriate
  verification. Documentation-only commits usually need a read-through and
  `git diff --check`.
- Before committing, check the active branch and working tree with
  `git branch --show-current` and `git status --short --branch`.
- Never rewrite, reset, or discard user changes unless the user explicitly asks
  for that operation. If unrelated local changes are present, leave them alone.
- Do not push or delete remote branches unless the user explicitly asks.
- When branch history needs cleanup, prefer local branch correction first:
  create the correct branch from the intended base, cherry-pick or reapply only
  the required commits, verify, and ask before any destructive remote action.

## Verification Routing

- CLI-affecting changes: baseline in `cli/agents.md` plus `docs/testing.md`.
- Web-affecting changes: baseline in `web/agents.md` plus `docs/testing.md`.
- Documentation-only changes: a read-through and `git diff --check` are usually
  sufficient unless the edited document defines executable commands or
  contracts (`res/templates/workflow.md` is the runtime agent contract).

## Agent Workflow

1. Identify the affected package or packages.
2. Read this root guide and the required package guide(s).
3. Read the smallest relevant docs under `docs/`.
4. Plan the change with explicit acceptance criteria.
5. Implement a minimal patch.
6. Verify with package-appropriate commands.
7. Report changed files, intent, risk, and exact verification results.
