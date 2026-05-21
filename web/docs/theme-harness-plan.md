# Theme Harness Implementation Plan

Source harness: `/home/relained/Documents/knoter/agents.md`

## Operator Task Card

Objective: introduce a modular runtime theming harness without changing current app behavior.

Scope for batch 1:

- Define a Base16 color scheme source.
- Map UI element ids to Base16 colors through one-to-many aliases.
- Add a runtime resolver that converts the scheme and aliases into CSS variables.
- Add a runtime loader for immediate Base16 scheme replacement.
- Preserve current menu, toolbar, tab, and preview behavior.
- Keep menu/toolbar edge preview guide lines separate from tab placement preview.

Out of scope for batch 1:

- Theme picker UI.
- External theme file import UI.
- Icon registry migration.
- Full CSS directory split.

Acceptance criteria:

- Current dark/orange appearance remains visually equivalent.
- Menu primary action orange remains independent from preview tokens.
- Edge preview uses guide-line tokens only.
- Tab placement preview uses placement-zone tokens only.
- Runtime `window.knoterTheme.loadBase16Theme(scheme, { persist: true })` can replace the active scheme.
- `npm run check` passes.

## Harness Flow

1. Design: this document records the task card, scope, acceptance criteria, and rollback plan.
2. Implement: apply only the Base16 runtime harness and token alias wiring.
3. Verify: run `npm run check`; inspect changed token references.
4. Release notes: summarize files changed, behavior preserved, and next harness batch.

## Batch 1 Verification Log

- Worker verification command: `npm run check`
- Result: PASS, Vite production build completed.
- Fast Analyzer checklist:
  - Syntax/build: PASS
  - Menu primary action token remains separate from preview tokens: PASS
  - Edge preview guide token remains separate from tab placement token: PASS
  - External theme UI intentionally not implemented in batch 1: PASS
- Final Analyzer gate: pending independent review before commit/merge.

## Batch 2 Token Split Log

Objective: split the static CSS surface into ordered token and component modules while preserving behavior.

Changed structure:

- `src/styles/index.css`: single style import entrypoint.
- `src/styles/tokens/`: Base16, semantic, component, motion, density, and typography token files.
- `src/styles/components/`: app shell, menu, sidebar, workspace, pane, toolbar, preview, tab, viewer, floating window, command palette, system, and responsive modules.

Acceptance checks:

- Legacy `src/theme.css`, `src/motion.css`, and `src/styles.css` imports removed: PASS
- Main entry imports only `src/styles/index.css`: PASS
- Preview token boundaries preserved: PASS
- Worker verification command: `npm run check`
- Result: PASS, Vite production build completed.

## Batch 3 Runtime Appearance Log

Objective: connect runtime theme loading to a developer-facing command and persist selected Base16 schemes.

Changed behavior:

- Added built-in Base16 schemes: default dark, graphite blue, and paper light.
- Added `window.knoterTheme.cycleBase16Theme({ persist: true })`.
- Added `window.knoterTheme.getActiveBase16Theme()` and `getBuiltInBase16Themes()`.
- Added a command palette action: `Base16 테마 변경`.

Acceptance checks:

- Runtime theme switching uses the existing Base16 resolver: PASS
- Selected scheme persists under `knoter.appearance.base16.v1`: PASS
- Existing menu/preview token boundaries are unchanged: PASS
- Accent glow shadow is derived from the active Base16 accent: PASS
- Worker verification command: `npm run check`
- Result: PASS, Vite production build completed.

## Batch 4 TSX Migration Log

Objective: migrate the renderer source from JS/JSX to TS/TSX before adding more architecture.

Changed behavior:

- `src/main.jsx` became `src/main.tsx`.
- Components moved from `.jsx` to `.tsx`.
- Domain, state, theme runtime, and geometry modules moved from `.js` to `.ts`.
- Added `tsconfig.json`, `src/vite-env.d.ts`, and project domain types.
- `npm run check` now runs `tsc --noEmit && vite build`.

Acceptance checks:

- HTML entry points at `/src/main.tsx`: PASS
- TypeScript compile gate is active: PASS
- Vite production build still succeeds: PASS
- Worker verification command: `npm run check`
- Result: PASS, TypeScript and Vite production build completed.

## Batch 4b Strict TypeScript Log

Objective: enable `strict: true` and resolve the resulting type failures.

Changed behavior:

- `tsconfig.json` now uses `strict: true`.
- Component props are explicitly typed.
- Workspace, floating window, preview, and persistence boundaries use domain types.
- `main.tsx` command list construction moved to `src/commands/workspaceCommands.ts`.

Acceptance checks:

- `tsc --noEmit` passes under strict mode: PASS
- Vite production build still succeeds: PASS
- Command definitions are no longer embedded directly in `main.tsx`: PASS
- Worker verification command: `npm run check`
- Result: PASS, TypeScript strict check and Vite production build completed.

## Batch 5 Icon Registry Log

Objective: move direct component icon imports behind a semantic icon registry.

Changed behavior:

- Added `src/icons/registry.tsx` with semantic icon ids.
- Added `src/icons/Icon.tsx`.
- App menu, toolbar, tabs, sidebar, floating windows, and command palette now render icons by semantic id.
- Direct `lucide-react` imports are isolated to the icon registry.

Acceptance checks:

- `lucide-react` implementation detail is centralized in `src/icons/registry.tsx`: PASS
- Command palette commands use icon ids instead of component constructors: PASS
- Existing drag move icon remains the cross-arrow move icon: PASS
- Worker verification command: `npm run check`
- Result: PASS, TypeScript and Vite production build completed.

## Role Mapping

- Operator: owns this plan, acceptance criteria, and routing.
- Worker: implements the bounded batch in `src/theming/`, `src/styles/`, and related imports.
- Fast Analyzer: checks diff and `npm run check` output for obvious misses.
- Analyzer: final review should receive changed files, tests run, and this acceptance list only.

## Rollback Plan

Remove `src/theming/`, remove its import/use from `src/main.tsx`, and keep static CSS variables in `src/styles/tokens/`.

## Next Batches

Feature execution now follows `docs/feature-harness-plan.md`.

1. Run `feature/workspace-reducer` through Worker Pod 1.
2. Run `feature/external-base16-import` through Worker Pod 2.
3. Run `feature/icon-theme-runtime` through Worker Pod 3.
4. Run `feature/workspace-tests` through Worker Pod 4.
5. Merge each feature to `dev` only after its paired Fast Analyzer returns `PASS`.
6. Run the final independent Analyzer gate before stabilizing `dev` into `main`.
