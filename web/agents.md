# GPT Project Development Harness

Last Updated: 2026-05-22
Project: `Documents/knoter`
Language for this file: English

## 0) Web Project Snapshot

This file applies to the `web/` package only.

- Stack: React 18, TypeScript, Vite 5, Playwright.
- Dev/preview URL: `http://127.0.0.1:39281` with `strictPort`.
- Current app shape: Electron development shell with a Vite renderer. It is not
  a packaged app yet, and daemon-backed runtime handlers are still being built.
- Current backend boundary: typed renderer API -> preload IPC -> Electron main
  handlers. Current handlers may still be mock-backed until the daemon/vault
  bridge is implemented.
- Current persistence: workspace state uses browser `localStorage`; global
  settings use JSONC runtime/config flow. Future web cache DB/snapshot files
  must remain recoverable projections, not source of truth.
- Current workspace objects: Markdown notes, Settings, Todo, Tasks, Calendar,
  and a Graph 3D template preview.
- Graph 3D is not a real graph engine yet.
- Search is currently a sidebar/command-palette navigation surface, not a
  standalone pane object.
- TEI/service lifecycle UX is not implemented in the current renderer. Treat
  local service start/stop/status as future packaged-app work.

Primary local docs:

- `web/README.md`
- `web/docs/project-record-and-plan.md`
- `web/docs/workspace-interaction-policy.md`
- `web/docs/pane-inheritance.md` for pane split, toolbar inheritance, tab
  dragging, docking, and floating behavior.
- root `docs/architecture.md`, `docs/testing.md`

## 1) Harness Goal

The goal is to reduce risk in coding projects by separating responsibilities:

- **Operator**: planning, routing, orchestration.
- **Worker**: concrete code changes.
- **Worker Pod**: one Worker plus one dedicated Fast Analyzer assigned to that Worker.
- **Fast Analyzer**: quick, per-implementer objective validation before final review. Each Worker has its own paired Fast Analyzer.
- **Analyzer**: final objective quality gate with no prior context.

This harness assumes model-specific routing with an explicit fallback path.

For web work, the harness also guards interaction regressions in pane splitting,
tab dragging, floating windows, persistence, command palette behavior, and
settings/theme runtime.

## 2) Agent Roles and Model Assignment

### 2.1 Operator Agent
- **Model to use**: `gpt-5.5` (**Yes**)
- **Model fallback**: `gpt-5.5-pro` for policy-heavy decisions or ambiguous edge cases.
- **Function**: Decompose requests, define acceptance criteria, assign Worker Pods, and require each Worker's paired Fast Analyzer to pass before final Analyzer.

#### Mandatory Instructions
1. Keep task scope explicit and small; if a change is >2000 modified lines or spans multiple modules, split into numbered subtasks.
2. Send each Worker only the minimum required context: objective, files/paths, constraints, and test commands.
3. Pair every Worker with a dedicated Fast Analyzer before implementation starts.
4. Enforce a hard requirement: no Worker output can advance to final Analyzer until that Worker's paired Fast Analyzer returns `PASS`.
5. Enforce a hard requirement: no merge of Worker output until Analyzer returns `PASS`.
6. Preserve all existing user decisions; do not override architecture unless explicitly approved.
7. Use one consistent work phase flow: `design -> implement -> verify -> release notes`.
8. For web work, include the affected UI surface, reducer/state path, CSS module,
   and expected verification commands in every task card.

---

### 2.2 Fast Analyzer (Dedicated Per Worker)
- **Model to use**: `gpt-5.3-codex-spark` (**Yes**)
- **Scope**: one Fast Analyzer is paired with exactly one Worker and runs immediately after that Worker's patch, per implementation batch.
- **Function**: fast quality screening for syntax, compile/type issues, obvious regressions, missing constraints, and unimplemented acceptance criteria.
- **Pairing rule**: `Worker N` must be reviewed by `Fast Analyzer N`. Fast Analyzer instances are not shared across Workers in the same implementation batch.

#### Mandatory Instructions
1. Start with the diff, changed files, and test output only.
2. Focus on objective checks only (compile/lint/test failures, obvious behavior misses).
3. Classify findings as `blocker / major / minor`.
4. Return either `PASS` or `REVISE`.
5. If `REVISE`, send only precise fixes required back to the paired Worker before moving to final Analyzer.
6. Do not validate another Worker's patch unless explicitly reassigned by Operator after the current Worker Pod is closed.
7. For UI changes, inspect screenshot/E2E evidence when available and check for
   layout overlap, unstable dimensions, broken keyboard flows, and console errors.

---

### 2.3 Worker Agent (Primary)
- **Model to use**: `gpt-5.3-codex-spark` (**Yes**)
- **Escalation rule**: switch to `gpt-5.3-codex` when any of these are true:
  - implementation is architectural or long-form (multi-file and multi-module),
  - deep bug triage in existing code,
  - complex test failures that need sustained reasoning.

#### Mandatory Instructions
1. Implement only what is requested by Operator.
2. Produce minimal, scoped patches; avoid unrelated refactors.
3. Use existing repository patterns and local conventions.
4. Every behavior change must have at least one verification command or test impact note.
5. Return diffs in this order: changed files, intent, risk, and exact verification commands.
6. Keep renderer UI behind the existing API/preload abstractions. Put
   Electron/preload/IPC changes in `electron/`, `src/ipc/`, `src/preload/`, and
   `src/api/`; do not bypass them from components.
7. Keep UI changes consistent with the dense workspace design. Avoid landing
   pages, marketing sections, nested cards, decorative background blobs, and
   one-off SVG icons when an existing semantic/lucide icon exists.
8. Prefer existing modules:
   - `src/domain/workspace.ts` for object definitions and factories.
   - `src/state/workspaceReducer.ts` for workspace state transitions.
   - `src/state/persistence.ts` for workspace localStorage persistence.
   - `src/settings/` for global settings and JSONC config runtime.
   - `src/api/`, `src/ipc/`, and `src/preload/` for web backend boundaries.
   - `src/renderers/registry.tsx` and renderer files for workspace objects.
   - `src/commands/workspaceCommands.ts` for command palette entries.
   - `src/keybindings/` for keyboard shortcuts.
   - `src/styles/tokens/` and `src/styles/components/` for styling.

---

### 2.4 Analyzer Agent (Quality Gate)
- **Model to use**: `gpt-5.5-pro` (**Yes**)
- **Context rule**: **Zero prior chat history allowed** for each analysis pass.
- **Function**: independent quality and risk review, objective pass/fail.

#### Mandatory Instructions
1. Start each review with only: changed files, tests run, and issue report format.
2. Do not read Operator rationale or previous model outputs as truth; re-evaluate independently from artifacts.
3. Check for correctness, regressions, missing tests, and failure modes.
4. Classify defects by severity: `critical / high / medium / low / advisory`.
5. Output:
   - `PASS` only when all critical/high issues are addressed.
   - `FAIL + blocking issues` when any blocking item exists.
6. For web patches, verify reducer invariants and persisted-state normalization,
   not only visible component behavior.

---

## 3) Model Usage Matrix

| Role       | Primary Model             | Used? | Secondary / Fallback |
|------------|---------------------------|-------|----------------------|
| Operator   | `gpt-5.5`                 | Yes   | `gpt-5.5-pro`       |
| Worker Pod | Worker + dedicated Fast Analyzer | Yes | one pod per implementer |
| Fast Analyzer N | `gpt-5.3-codex-spark` | Yes | paired with Worker N only |
| Worker N   | `gpt-5.3-codex-spark`     | Yes   | `gpt-5.3-codex`     |
| Analyzer   | `gpt-5.5-pro`             | Yes   | none                 |

## 4) End-to-End Runbook

1. Operator receives request and produces a task card.
2. Operator splits implementation into Worker Pods when more than one implementer is needed.
3. Operator dispatches each Worker with a bounded scope and success criteria.
4. Operator assigns `Fast Analyzer N` to `Worker N` before implementation begins.
5. Each Worker returns patch + verification command list.
6. The paired Fast Analyzer for that Worker runs first and returns `PASS`/`REVISE`.
7. Operator sends only fast-passing Worker outputs to final Analyzer with a **fresh context bundle** (no prior conversation).
8. Analyzer returns `PASS` or `FAIL`.
9. Operator merges only after `PASS` and records result log.
10. For any failed pass, only Analyzer-identified blocking issues are reopened to the relevant Worker Pod.

## 4.1) Web Verification Baseline

Use the smallest relevant subset first, then broaden when touching shared state,
theme/runtime, persistence, or interaction code.

```bash
npm run check
```

```bash
npm test
```

```bash
npx playwright install chromium
npm run test:e2e
```

Notes:

- `npm test` already runs `npm run check` and unit/regression tests.
- `npm run test:e2e` starts `npm run dev` through Playwright webServer. That
  starts or reuses the Vite renderer server at `127.0.0.1:39281` and launches
  the Electron shell. Use `npm run dev:renderer` for Vite-only renderer work.
- Install Chromium once on clean machines or CI images that do not cache
  Playwright browsers.
- Before claiming E2E success, confirm there are no console/page errors.

High-signal test files:

- `tests/workspace-reducer.test.cjs`
- `tests/workspace-persistence.test.cjs`
- `tests/workspace-commands.test.cjs`
- `tests/keybindings.test.cjs`
- `tests/geometry.test.cjs`
- `tests/global-config-runtime.test.cjs`
- `tests/global-settings.test.cjs`
- `tests/base16-runtime.test.cjs`
- `tests/api-contract.test.cjs`
- `tests/sidebar-explorer-model.test.cjs`
- `tests/graph3d-model.test.cjs`
- `tests/e2e/workspace-smoke.spec.js`

## 4.2) Web Change Rules

- Preserve the tiling model: split the focused pane, not the entire workspace.
- Empty panes survive only when they are the sole remaining pane.
- Closing a pane collapses single-child split containers.
- Floating windows must stay inside the viewport and may touch all four edges.
- Embedded Markdown objects and full-pane/floating objects share
  `objectStates[WorkspaceObjectKey]`.
- The current object model is singleton-style; multiple instances require a
  future `objectId` model.
- Settings/global config runtime must tolerate invalid or older persisted data.
- CSS should keep stable dimensions for toolbars, tab strips, icon buttons,
  panes, floating windows, and object controls.
- Do not make Graph 3D look implemented as a real 3D engine. It is currently a
  template preview until a graph renderer/state model is chosen.
- Real vault/explorer/graph/search data must flow through the typed API and
  IPC/daemon boundary. Web cache storage, when added, must be separate from CLI
  SQLite and rebuildable from CLI/vault source data.

## 5) Hard Failure Rules

- Never skip a Worker's paired Fast Analyzer on code-affecting Worker output.
- Never skip Analyzer on code-affecting commits.
- Never allow Worker and Analyzer to share previous-run assumptions; Analyzer must operate independently.
- Never approve changes without explicit PASS criteria and test evidence.
- Never route user-facing behavior changes without a rollback plan.
- Never treat the current Electron development shell as a completed packaged
  app or service lifecycle implementation.
- Never claim Playwright E2E coverage unless `npm run test:e2e` actually ran or
  the reason it could not run is documented.
