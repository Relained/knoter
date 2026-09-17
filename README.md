# knoter

A local-first knowledge workspace for source-backed wiki documents, chat, tasks,
and calendar views.

| Start here | Purpose |
| --- | --- |
| [V2 frontend](v2/README.md) | Browser prototype of the desktop rewrite; uses disposable demo data |
| [V1 application](v1/README.md) | Legacy CLI, Electron workbench, and vault templates |
| [Project memory](docs/README.md) | Design reasons, failures, constraints, and future implementation gates |

Each package README owns its setup and check commands. The rewrite and legacy
applications have separate storage and runtime contracts; do not use the
prototype as a real vault or migrate existing data implicitly.

For changes, start with the [root agent guide](agents.md).
[Vault workflow templates](v1/res/templates/workflow.md) are runtime instructions
copied into new vaults; existing vaults keep their customized copies.
