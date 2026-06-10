import type { CSSProperties } from "react";
import type { ToolKey } from "../types";

type ToolMenuEntry = {
  label: string;
  commandId: string;
};

const toolMenuEntries: Partial<Record<ToolKey, ToolMenuEntry[]>> = {
  artifacts: [
    { label: "Pin Widget: LLM Wiki", commandId: "pin.llm-wiki" },
    { label: "Pin Widget: Calendar", commandId: "pin.calendar" },
    { label: "Pin Widget: Todo", commandId: "pin.todo" },
    { label: "Create New Artifact Template", commandId: "template.create" },
    { label: "Open Effective Template", commandId: "template.get" },
    { label: "Run Agent Rewrite", commandId: "llm.rewrite" },
    { label: "Build Report Context", commandId: "report.context" },
    { label: "Open Artifact List", commandId: "palette.artifacts" },
  ],
  source: [
    { label: "Add Source Files to Vault", commandId: "source.add" },
    { label: "Draft Source Metadata", commandId: "source.modal" },
    { label: "Write Daily Note", commandId: "open.daily-note" },
    { label: "Open Simple Note Editor", commandId: "open.simple-note" },
    { label: "Save Note to Vault", commandId: "note.save" },
  ],
  search: [
    { label: "Search Vault", commandId: "search.run" },
    { label: "Browse All Commands", commandId: "palette.open" },
    { label: "Refresh Vault Explorer", commandId: "explorer.refresh" },
    { label: "Sync Vault Index", commandId: "sync.run" },
    { label: "Vault Status", commandId: "vault.status" },
    { label: "List Vaults", commandId: "vault.list" },
    { label: "Switch Vault", commandId: "vault.switch" },
    { label: "List Tags", commandId: "tag.list" },
  ],
};

export function ToolMenu({
  tool,
  style,
  onRunCommand,
}: {
  tool: ToolKey;
  style?: CSSProperties;
  onRunCommand: (commandId: string) => void;
}) {
  const items = toolMenuEntries[tool] ?? [
    { label: "Open Settings", commandId: "settings.open" },
  ];

  return (
    <div className="overlay-tool-menu" role="menu" style={style}>
      {items.map((item) => (
        <button
          type="button"
          role="menuitem"
          onClick={() => onRunCommand(item.commandId)}
          key={item.commandId}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
