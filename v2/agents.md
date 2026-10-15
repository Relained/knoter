# knoter V2 agent guide

Apply the [root rules](../agents.md). This is the isolated rewrite; legacy Web
HTML-first and command-registry rules do not apply here. The assigned native
milestone is the [wiki-worker demo](../docs/plan/wiki-worker-demo.md). Keep its
connected service and the browser prototype distinct; label simulated operations
clearly. PDF, Windows, real tasks/calendar, and production distribution are
outside this demo. The connected side chat follows D22 in that plan.

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
  service. Do not grant the model shell, filesystem, or DB mutation tools. Each
  worker CLI adapter (Codex, Claude Code) exposes only the wiki evidence tools plus
  web search, and stops an attempt whose reported tools differ. Per the user's
  2026-10-16 decision (D12), supplements may come from the model's knowledge and
  the web: the service, not the model, reads pages through bounded `reference_read`
  (https only, with private-network addresses refused at connect time), stores the
  evidence, and keeps the user's material and marked supplements distinct. Never
  send note text in an outbound request.
  The user approved a local LaunchAgent for this unsigned macOS demo; do not
  represent it as the deferred SMAppService signing integration.
- Side-chat turns get the same evidence tools plus the read-only `wiki_check`.
  Their changes go through the service's proposal validation and commit path;
  a chat request or attachment becomes a source only when a revision cites it,
  and never enqueues background work. Keep stopped, failed, and restarted
  replies visibly incomplete and unapplied.

Use npm. Follow [README.md](README.md) for setup/check commands and browser-preview
failure evidence. Keep native failures in the shared
[wiki-worker record](../docs/lessons/wiki-worker-demo.md). Manually exercise
affected browser flows and report limits. The root no-test-automation/CI
instruction applies. Do not treat browser checks
as native-platform verification.
