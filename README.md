# knoter

A local-first knowledge workspace for source-backed wiki documents, chat, tasks,
and calendar views.

| Start here | Purpose |
| --- | --- |
| [V2 frontend](v2/README.md) | Browser prototype of the desktop rewrite; uses disposable demo data |
| [Project memory](docs/README.md) | Design reasons, failures, constraints, and future implementation gates |

Each package README owns its setup and check commands. The legacy V1 application
(CLI, Electron workbench, and vault templates) was removed from this repository
on 2026-11-20 and remains in Git history. The rewrite has its own storage and
runtime contracts; do not use the prototype as a real vault or migrate existing
data implicitly. Existing vaults keep their customized workflow templates.

For changes, start with the [root agent guide](agents.md).
