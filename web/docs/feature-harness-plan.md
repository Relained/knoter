# Feature Harness Plan

Source harness: `/home/relained/Documents/knoter/agents.md`
Baseline branch: `dev`
Stable baseline commit: `5a7e963 Stabilize typed workspace shell`

## Operating Rule

Every feature branch uses a dedicated Worker Pod:

- `Worker N`: implements one bounded feature scope.
- `Fast Analyzer N`: validates only `Worker N` output before any merge request advances.
- `Analyzer`: performs the final independent gate after all paired Fast Analyzer checks pass.

No feature branch is merged into `dev` unless its paired Fast Analyzer returns `PASS`.
No `dev` stabilization merge proceeds toward `main` unless the final Analyzer returns `PASS`.

## Common Gates

- Base branch: `dev`
- Feature flow: `design -> implement -> verify -> release notes`
- Verification command: `npm run check`
- Regression guard:
  - menu/toolbar edge drag keeps guide-line preview behavior,
  - menu bar primary orange action remains separate from preview tokens,
  - tab drag uses placement preview without the thick orange guide line,
  - tab movement does not reset menu bar position,
  - Base16 element ids remain stable for theme mapping,
  - semantic icon ids remain stable for icon theme switching.
- Rollback path: abandon the feature branch before merge, or revert the feature merge commit on `dev`.

## Feature Matrix

| Feature branch | Worker Pod | Scope | Merge gate |
| --- | --- | --- | --- |
| `feature/workspace-reducer` | Worker 1 + Fast Analyzer 1 | Extract workspace mutation and layout updates from `main.tsx` into typed reducer-style modules. | `npm run check`, Fast Analyzer 1 `PASS`, no drag/menu regression. |
| `feature/external-base16-import` | Worker 2 + Fast Analyzer 2 | Add external Base16 JSON validation and runtime import path. | `npm run check`, Fast Analyzer 2 `PASS`, invalid theme input cannot crash the app. |
| `feature/icon-theme-runtime` | Worker 3 + Fast Analyzer 3 | Add runtime-selectable icon theme structure behind semantic icon ids. | `npm run check`, Fast Analyzer 3 `PASS`, lucide default remains unchanged. |
| `feature/workspace-tests` | Worker 4 + Fast Analyzer 4 | Add automated test harness for workspace/domain/theme behavior. | `npm run check`, test command documented, Fast Analyzer 4 `PASS`. |

## Worker Pod 1: Workspace Reducer

Branch: `feature/workspace-reducer`

Objective: reduce `main.tsx` orchestration weight by moving workspace state transitions into typed reducer-style modules while preserving current UI behavior.

Owned areas:

- `src/main.tsx`
- new or existing workspace state modules under `src/domain/`, `src/state/`, or `src/workspace/`
- command wiring only when needed to consume the extracted API

Acceptance criteria:

- Workspace pane, tab, floating window, and menu bar movements behave as before.
- Tab movement preserves menu bar position.
- Edge/menu preview and tab placement preview remain separated.
- Extracted reducer/action types are explicit enough to remain compatible with `strict: true`.
- `npm run check` passes.

Fast Analyzer 1 checklist:

- Changed files match Pod 1 ownership.
- No unrelated styling or theme edits.
- Drag preview separation still exists in the diff.
- No new `any`-based escape hatches without justification.
- Verification output includes `npm run check`.

Execution log:

- Branch: `feature/workspace-reducer`
- Worker verification command: `npm run check`
- Worker result: PASS, TypeScript and Vite production build completed.
- Fast Analyzer 1 result: PASS, no blocker/major/minor findings.
- Merge status: ready for `dev`.

## Worker Pod 2: External Base16 Import

Branch: `feature/external-base16-import`

Objective: add a safe runtime path for importing external Base16 JSON schemes without coupling theme loading to UI controls.

Owned areas:

- `src/theming/base16.ts`
- `src/theming/runtime.ts`
- optional theme validation helper under `src/theming/`
- documentation updates describing the accepted schema

Acceptance criteria:

- Runtime import validates required Base16 keys before applying.
- Invalid input returns a typed failure result or throws a controlled, documented error without mutating the active theme.
- Existing built-in theme cycling and persistence continue to work.
- Element id to Base16 alias mapping remains stable.
- `npm run check` passes.

Fast Analyzer 2 checklist:

- Changed files match Pod 2 ownership.
- Validation covers missing keys and malformed color strings.
- Failed import does not partially apply CSS variables.
- Existing `window.knoterTheme` API remains backward compatible.
- Verification output includes `npm run check`.

Execution log:

- Branch: `feature/external-base16-import`
- Worker verification command: `npm run check`
- Worker result: PASS, TypeScript and Vite production build completed.
- Fast Analyzer 2 result: PASS, no blocker/major/minor findings.
- Merge status: ready for `dev`.

## Worker Pod 3: Icon Theme Runtime

Branch: `feature/icon-theme-runtime`

Objective: make icon implementation dynamically selectable while preserving semantic icon ids and the current lucide default.

Owned areas:

- `src/icons/Icon.tsx`
- `src/icons/registry.tsx`
- optional icon runtime/theme module under `src/icons/`
- command or appearance wiring only if needed for runtime selection

Acceptance criteria:

- Components continue to request icons by semantic id, not direct package imports.
- Lucide remains the default icon set.
- Runtime icon theme selection can swap registries or is represented by a stable extension point.
- Missing icon ids fall back predictably.
- `npm run check` passes.

Fast Analyzer 3 checklist:

- Direct `lucide-react` imports remain isolated to registry implementation files.
- Existing cross-arrow drag/move icon remains semantically correct.
- No component receives raw icon components from command definitions.
- Runtime icon theme changes do not alter color token ownership.
- Verification output includes `npm run check`.

Execution log:

- Branch: `feature/icon-theme-runtime`
- Worker verification command: `npm run check`
- Worker result: PASS, TypeScript and Vite production build completed.
- Fast Analyzer 3 result: PASS, no blocker/major/minor findings.
- Merge status: ready for `dev`.

## Worker Pod 4: Workspace Tests

Branch: `feature/workspace-tests`

Objective: add a focused automated test harness around the areas most likely to regress during the reducer, theme, and icon runtime work.

Owned areas:

- test configuration files
- `tests/` or colocated test files
- minimal package script changes required to run tests

Acceptance criteria:

- Workspace reducer/domain behavior is testable without rendering the full app.
- Theme validation and runtime application have unit coverage where practical.
- Preview behavior has at least a domain-level or component-level regression test if the current stack supports it.
- Test command is documented and integrated with `npm run check` when practical.
- Existing build remains green.

Fast Analyzer 4 checklist:

- Tests assert behavior, not implementation trivia.
- Test setup does not weaken TypeScript strictness.
- Added dependencies are justified and minimal.
- `npm run check` and the explicit test command are reported.

Execution log:

- Branch: `feature/workspace-tests`
- Worker verification command: `npm test`
- Worker result: PASS, `npm run check` plus Node unit tests completed.
- Fast Analyzer 4 result: PASS, no blocker/major/minor findings.
- Merge status: ready for `dev`.

## Integration Order

1. Start `feature/workspace-reducer` first because it reduces the risk of later runtime wiring.
2. Run `feature/external-base16-import` after reducer boundaries are stable.
3. Run `feature/icon-theme-runtime` in parallel only if it does not touch workspace reducer files.
4. Run `feature/workspace-tests` after the reducer API is stable enough to test directly.
5. Merge each feature into `dev` only after its paired Fast Analyzer returns `PASS`.
6. Stabilize `dev` with a final Analyzer review before any merge back to `main`.
