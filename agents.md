# knoter Root Agent Guide

Last updated: 2026-05-22
Project: `Documents/knoter`
Language for this file: English

This is the root routing guide for agent work in the `knoter` monorepo. It is
intentionally short. Package-specific instructions are authoritative for their
own areas and must be read before changing code in those areas.

## Required Package Guides

Before doing package-specific work, read the matching guide:

- Web/frontend work: `web/agents.md`
- CLI/MCP/indexing/search work: `cli/agents.md`

If a task touches both packages, read both guides before planning or editing.
When package guides conflict, follow the guide for the files being changed. For
cross-package behavior, preserve the stricter constraint unless the user
explicitly approves a different direction.

## Repository Map

| Path | Role |
| --- | --- |
| `web/` | React/Vite workspace frontend and UI tests. |
| `cli/` | Bun/TypeScript CLI, MCP server, indexing, retrieval, and storage. |
| `docs/` | Shared architecture, planning, testing, and template documentation. |
| `README.md` | Root project overview. |

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

- Keep `dev` as the shared integration base for agent-facing repository
  guidance and cross-package planning docs.
- Use package-scoped feature branches for implementation work:
  - Web work: `web/<feature>`
  - CLI work: `cli/<feature>`
  - Cross-package integration work: `integration/<feature>`
- Do not use branch names under `dev/...` when a local or remote `dev` branch
  exists. Git refs cannot cleanly contain both `dev` and `dev/<name>` at the
  same time.
- Branch new package implementation work from `dev` unless the user explicitly
  approves a different base. Continue on an existing active package branch when
  it already matches the requested work.
- Keep CLI and web implementation commits on separate package branches until an
  integration branch is explicitly needed.
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

For web-affecting changes, use the baseline in `web/agents.md` and shared
testing guidance in `docs/testing.md`.

For CLI-affecting changes, use the baseline in `cli/agents.md` and shared
testing guidance in `docs/testing.md`.

For documentation-only changes, a read-through and `git diff --check` are
usually sufficient unless the edited document defines executable commands or
contracts.

## Agent Workflow

1. Identify the affected package or packages.
2. Read this root guide and the required package guide(s).
3. Read the smallest relevant docs under `docs/`.
4. Plan the change with explicit acceptance criteria.
5. Implement a minimal patch.
6. Verify with package-appropriate commands.
7. Report changed files, intent, risk, and exact verification results.
