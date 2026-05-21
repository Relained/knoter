import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { Command } from "../commands/types";
import { Icon } from "../icons/Icon";

type CommandPaletteProps = {
  commands: Command[];
  onClose: () => void;
};

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );

  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return commands.filter((command) => getCommandSearchText(command).includes(normalized));
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
    return () => restoreFocusRef.current?.focus?.();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function run(command: Command) {
    onClose();
    command.run();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      onClose();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      return;
    }

    if (event.key === "Enter" && filteredCommands[selectedIndex]) {
      run(filteredCommands[selectedIndex]);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredCommands.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setSelectedIndex((current) => (current + delta + filteredCommands.length) % filteredCommands.length);
    }
  }

  return (
    <div className="palette-backdrop" onPointerDown={(event: PointerEvent<HTMLDivElement>) => event.target === event.currentTarget && onClose()}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          type="search"
          placeholder="Search commands, notes, and objects..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={filteredCommands[selectedIndex]?.id ? `command-${filteredCommands[selectedIndex].id}` : undefined}
        />
        <div className="command-list" id="command-list" role="listbox">
          {filteredCommands.map((command, index) => {
            return (
              <button
                key={command.id}
                id={`command-${command.id}`}
                className={`command-item ${index === selectedIndex ? "is-selected" : ""}`}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => run(command)}
              >
                <span className="command-name">
                  <Icon name={command.icon} size={16} />
                  {command.label}
                </span>
                <small>{command.hint}</small>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function getCommandSearchText(command: Command) {
  return [command.id, command.label, command.hint, ...(command.keywords ?? [])].join(" ").toLowerCase();
}
