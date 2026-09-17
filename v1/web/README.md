# knoter Web workbench

The legacy Electron UI for CLI-managed vaults. For the isolated browser rewrite,
see [V2](../../v2/README.md).

Use npm and make Bun available for the [CLI](../cli/README.md).
From the repository root:

```sh
cd v1/web
npm install
npm run dev
```

This starts Vite at `http://127.0.0.1:39281` and Electron against the active vault
in `~/.config/knoter/config.json`. It does not create an isolated test vault;
manual actions affect the selected vault. Use disposable data for walkthroughs.

For code changes, run `npm run check` here (TypeScript + production build).
Build success does not establish GUI behavior; follow the
[manual verification guidance](../docs/architecture.md#verification-evidence-and-operational-cautions).

Read [agents.md](agents.md) before changing the renderer, IPC, or HTML handling.
