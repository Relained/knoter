import { useEffect, useRef } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
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
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Menu convention: opening focuses the first item; closing returns focus
  // to the trigger unless something else (e.g. an outside click) took it.
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    menuItems(menuRef.current)[0]?.focus();
    return () => {
      if (document.activeElement === document.body) opener?.focus();
    };
  }, [tool]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = menuItems(menuRef.current);
    if (buttons.length === 0) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = buttons.length - 1;
    else if (current === -1)
      nextIndex = event.key === "ArrowDown" ? 0 : buttons.length - 1;
    else {
      const step = event.key === "ArrowDown" ? 1 : -1;
      nextIndex = (current + step + buttons.length) % buttons.length;
    }
    buttons[nextIndex].focus();
  }

  return (
    <div
      className="overlay-tool-menu"
      role="menu"
      style={style}
      ref={menuRef}
      onKeyDown={onKeyDown}
    >
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

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}
