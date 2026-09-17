# knoter V2 agent guide

Apply the [root rules](../agents.md). This is the isolated rewrite; legacy Web
HTML-first and command-registry rules do not apply here. The assigned native
milestone is the [wiki-worker demo](../docs/plan/wiki-worker-demo.md). Keep its
connected service and the browser prototype distinct; label simulated operations
clearly. PDF, Windows, real chat/tasks/calendar, and production distribution are
outside this demo.

- Use React/TypeScript/Vite, Tailwind/shared tokens, and repository-owned
  composable primitives. Reuse Radix for accessible interaction/focus behavior
  and the shared icon system rather than adding parallel UI conventions.
- All service calls go through `KnoterClient` in `packages/contracts`.
  Components do not access localStorage, Electron IPC, files, or providers;
  the mock adapter owns browser seed data, simulation, and persistence. Native
  calls use validated contracts through preload and main; only the service writes
  SQLite. Main owns source discovery, and workers read immutable job evidence.
- Treat source and edited document content as untrusted; never execute
  model-produced markup or enable raw HTML rendering.
- Preserve existing preview data, stable document identities, revisions, and
  drafts. Follow the [rewrite brief](../docs/plan/desktop-rewrite.md) for
  navigation, compact/Zen layout, wiki links, and recoverable deletion policy.
  Deleting a note must keep source files, tasks, other notes' Markdown, and
  historic chat intact; retain references so restoration can reconnect it.
- Use React Router for hash routes and navigation blocking; do not write browser
  history or add a second route parser. Keep the workspace shell mounted across
  routes. Read live editor content when checking unsaved changes, since editor
  change notifications are debounced; retain a separate unload guard.
- Preserve validated wire messages, cancellation/lease fencing, immutable source
  versions, revision citations, and migration compatibility when changing the
  service. Do not grant the model shell, arbitrary web, filesystem, or DB mutation
  tools. For the user's 2026-09-18 reference-wiki requirement, the service may
  fetch official MDN documentation through bounded `reference_read`; retain the
  fetched evidence and keep original-source and supplemental citations distinct.
  The user approved a local LaunchAgent for this unsigned macOS demo; do not
  represent it as the deferred SMAppService signing integration.

Use npm. Follow [README.md](README.md) for setup/check commands and retained
failure evidence. Manually exercise affected browser flows and report limits;
the root no-test-automation/CI instruction applies. Do not treat browser checks
as native-platform verification.
