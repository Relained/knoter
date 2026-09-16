# knoter v2 Agent Guide

This directory is the isolated rewrite. The current delivery is a browser-based
frontend prototype with a replaceable mock API, not an Electron/backend release.
Root repository rules apply. Legacy `web/agents.md` HTML-first and command-registry
rules describe the old application and do not define this new frontend.

- Use React, TypeScript, Vite, Tailwind, and composable UI primitives.
- Keep service calls behind `KnoterClient` in `packages/contracts`; UI components
  must not access localStorage, Electron IPC, files, or LLM providers directly.
- The mock adapter owns seeded data, async behavior, and local persistence.
- Keep original/source data and user-edited document content untrusted; never
  render raw HTML or execute model-produced markup.
- Do not add automated tests, test runners, Playwright suites, or CI workflows.
  The user explicitly deferred test automation on 2026-09-16. Verify with
  `npm run check`, a manual browser walkthrough, and `git diff --check`.
- Use npm from `v2/`. Run `npm run dev` for the prototype on port 39282.
- Keep backend, OS registration, PDF extraction, and real LLM work out of this
  frontend-only delivery. Clearly label simulated operations in the interface.

See `../docs/plan/desktop-rewrite.md` for the complete rewrite direction.
