# Base16 Import

Runtime API:

```ts
window.knoterTheme?.importBase16Theme(source, { persist: true });
```

`source` can be a JSON string or an object. External imports are strict: the active
theme is not changed unless validation succeeds.

## Required Colors

All Base16 color keys are required:

```json
{
  "scheme": "Example",
  "mode": "dark",
  "base00": "151515",
  "base01": "202020",
  "base02": "303030",
  "base03": "505050",
  "base04": "b0b0b0",
  "base05": "d0d0d0",
  "base06": "e0e0e0",
  "base07": "f5f5f5",
  "base08": "ac4142",
  "base09": "d28445",
  "base0A": "f4bf75",
  "base0B": "90a959",
  "base0C": "75b5aa",
  "base0D": "6a9fb5",
  "base0E": "aa759f",
  "base0F": "8f5536"
}
```

Hex colors may include or omit the leading `#`. The runtime normalizes accepted
colors to `#rrggbb` or `#rgb` form before applying CSS variables.

## Optional Metadata

- `id`: stable theme id. If omitted, the runtime derives one from `slug`, `name`, or `scheme`.
- `name` or `scheme`: display name.
- `mode`: `dark` or `light`; defaults to `dark`.

Invalid input returns `{ ok: false, issues }` and does not mutate the active
theme, persisted theme, DOM dataset, or CSS variables.
