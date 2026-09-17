# knoter V2 agent guide

Apply the [root rules](../agents.md). This is the isolated rewrite; legacy Web
HTML-first and command-registry rules do not apply here. The user assigned a
frontend prototype first. Keep real backend/OS/PDF/LLM work outside that delivery
unless the next milestone is assigned; label simulated operations clearly.

- Use React/TypeScript/Vite, Tailwind/shared tokens, and repository-owned
  composable primitives. Reuse Radix for accessible interaction/focus behavior
  and the shared icon system rather than adding parallel UI conventions.
- All service calls go through `KnoterClient` in `packages/contracts`.
  Components do not access localStorage, Electron IPC, files, or providers;
  the mock adapter owns seed data, async simulation, and persistence.
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
- Before real service integration, define source byte/handle transfer, validated
  wire messages, cancellation IDs, provenance, and storage migrations.
  The frontend contract is not a finished IPC protocol; `AbortSignal` is not
  a wire payload. Keep real and mock evidence distinct.

Use npm. Follow [README.md](README.md) for setup/check commands and retained
failure evidence. Manually exercise affected browser flows and report limits;
the root no-test-automation/CI instruction applies. Do not treat browser checks
as native-platform verification.
