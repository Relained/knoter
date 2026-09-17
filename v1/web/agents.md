# knoter Web agent guide

Apply the [root rules](../../agents.md). These rules concern `v1/web/`, not V2.
Use npm; setup/check commands live in [README.md](README.md). Before changing
interactions, read the [UI failure records](../docs/architecture.md#ui-failures-and-remedies)
and preserve their remedies instead of reproducing old bugs.

## Runtime and security boundaries

- Keep the renderer behind `window.knoterApi`: no Node/Electron imports, direct
  filesystem access, or database ownership in `src/`. Native handlers belong in
  `electron/`, with shared contracts in `src/core/`.
- All UI actions use the command registry and `executeCommand`, including buttons
  and shortcuts. Parameterized actions share the palette's option form; do not
  introduce divergent handlers.
- Treat artifact HTML and converted Markdown as untrusted. In-app content must
  use the existing sanitized `HtmlPageView` iframe (`sandbox=""`, no scripts).
- Detached content must use `html:openWindow`: strip executable/embedded content,
  event handlers, and external/`javascript:`/`data:` URLs; retain the deny-all
  CSP and sandbox. Never bypass these wrappers with raw `dangerouslySetInnerHTML`.
- Validate theme snapshots before interpolating document styles. Reuse
  `getSandboxTheme` for fonts/colors rather than hardcoding a separate palette.

## UI constraints

- Preserve the dense workbench: no marketing sections, nested cards, or
  decorative backgrounds. Reuse the semantic icon registry and shared
  color/radius tokens; avoid one-off SVGs and inline-style sprawl.
- Preserve main-area overlay scoping, popup escape from clipped containers,
  per-tab scroll retention, and zero padding for fixed-size icon buttons.
  Only the close button gets a tab hover highlight. The failure record explains
  the causes and memory tradeoff behind these rules.
- Reuse `useDialogDismiss` and its container ref for Escape/backdrop dismissal,
  focus trapping, and trigger restoration. Preserve palette/menu keyboard
  navigation and tab semantics when adding controls.
- Long operations use `beginOperation`/`endOperation` so progress stays visible;
  connection/vault state must remain available after transient toasts vanish.
- Bind shortcuts through the command system. Escape only dismisses. Avoid
  Electron-owned defaults (`Mod+W/R/M/Q` and `Mod+Shift+R`); users can customize
  bindings. Do not revive the retired workspace/3D renderer without a new decision.

For interaction changes, run the app and exercise affected flows manually,
including keyboard/focus behavior. Report unverified paths; build checks alone
are not interaction coverage. Operational cautions and unresolved backend
decisions belong in [project memory](../docs/architecture.md), not an IPC catalog.
