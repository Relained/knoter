import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../shared/icons/Icon";
import { formatChord, type KeybindingMap } from "../commands/keybindings";
import type {
  CommandOption,
  CommandValues,
  PendingCommand,
  WorkbenchCommand,
} from "../types";

export function CommandPaletteOverlay({
  query,
  items,
  pending,
  keybindings,
  onQuery,
  onSelect,
  onSubmitPending,
  onCancelPending,
  onClose,
}: {
  query: string;
  items: WorkbenchCommand[];
  pending: PendingCommand | null;
  keybindings: KeybindingMap;
  onQuery: (query: string) => void;
  onSelect: (command: WorkbenchCommand) => void;
  onSubmitPending: (values: CommandValues) => void;
  onCancelPending: () => void;
  onClose: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const activeIndex =
    items.length === 0 ? -1 : Math.min(selectedIndex, items.length - 1);
  const activeItem = activeIndex === -1 ? null : items[activeIndex];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (pending) onCancelPending();
        else onClose();
        return;
      }
      if (pending) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (items.length === 0) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        setSelectedIndex(
          (activeIndex + step + items.length) % items.length,
        );
        return;
      }
      if (event.key === "Enter" && activeItem) {
        onSelect(activeItem);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items, activeIndex, activeItem, pending, onCancelPending, onClose, onSelect]);

  useEffect(() => {
    resultsRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, items]);

  return (
    <div
      className="command-overlay"
      onPointerDown={(event) =>
        event.target === event.currentTarget && onClose()
      }
    >
      <section
        className="workbench-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {pending ? (
          <CommandOptionsForm
            pending={pending}
            onSubmit={onSubmitPending}
            onBack={onCancelPending}
          />
        ) : (
          <>
            <header>
              <span>COMMAND PALETTE</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close command palette"
              >
                Close
              </button>
            </header>
            <input
              value={query}
              onChange={(event) => onQuery(event.currentTarget.value)}
              placeholder="Search commands, documents, and views"
              aria-label="Search commands"
              autoFocus
            />
            <div className="command-results" role="listbox" ref={resultsRef}>
              {items.map((item, index) => (
                <button
                  className={index === activeIndex ? "is-selected" : ""}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={() => onSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  key={item.id}
                >
                  <span>
                    <Icon name={item.icon} size={15} />
                    {item.title}
                    {item.options && item.options.length > 0 && (
                      <small className="command-has-options">options...</small>
                    )}
                  </span>
                  <small>
                    {keybindings[item.id] && (
                      <kbd className="command-kbd">
                        {formatChord(keybindings[item.id])}
                      </kbd>
                    )}
                    {item.detail}
                  </small>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function CommandOptionsForm({
  pending,
  onSubmit,
  onBack,
}: {
  pending: PendingCommand;
  onSubmit: (values: CommandValues) => void;
  onBack: () => void;
}) {
  const options = pending.command.options ?? [];
  const [values, setValues] = useState<CommandValues>(() =>
    initialValues(options, pending.values),
  );

  useEffect(() => {
    setValues(initialValues(options, pending.values));
    // Re-seed only when a different command/preset lands in the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const missingRequired = useMemo(
    () =>
      options.filter(
        (option) =>
          option.required &&
          (values[option.key] === undefined ||
            String(values[option.key]).trim() === ""),
      ),
    [options, values],
  );

  function setValue(key: string, value: CommandValues[string]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    if (missingRequired.length > 0) return;
    onSubmit(values);
  }

  return (
    <form
      className="command-options-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <header>
        <span>
          <Icon name={pending.command.icon} size={15} />
          {pending.command.title}
        </span>
        <button type="button" onClick={onBack} aria-label="Back to command list">
          Back
        </button>
      </header>
      <div className="command-options-fields">
        {options.map((option, index) => (
          <label className="command-option-field" key={option.key}>
            <span>
              {option.label}
              {option.required ? " *" : ""}
            </span>
            <OptionInput
              option={option}
              value={values[option.key]}
              autoFocus={index === 0}
              onChange={(value) => setValue(option.key, value)}
            />
          </label>
        ))}
      </div>
      <footer>
        <span>{missingRequired.length > 0 ? "Required fields missing" : "Enter to run"}</span>
        <button type="submit" disabled={missingRequired.length > 0}>
          Run
        </button>
      </footer>
    </form>
  );
}

function OptionInput({
  option,
  value,
  autoFocus,
  onChange,
}: {
  option: CommandOption;
  value: CommandValues[string];
  autoFocus: boolean;
  onChange: (value: CommandValues[string]) => void;
}) {
  if (option.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value === true}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    );
  }
  if (option.type === "enum") {
    return (
      <select
        value={String(value ?? option.enumValues?.[0] ?? "")}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {(option.enumValues ?? []).map((enumValue) => (
          <option value={enumValue} key={enumValue}>
            {enumValue}
          </option>
        ))}
      </select>
    );
  }
  if (option.type === "number") {
    return (
      <input
        type="number"
        value={value === undefined ? "" : String(value)}
        placeholder={option.placeholder}
        autoFocus={autoFocus}
        onChange={(event) => {
          const parsed = Number(event.currentTarget.value);
          onChange(Number.isFinite(parsed) ? parsed : undefined);
        }}
      />
    );
  }
  return (
    <input
      type="text"
      value={typeof value === "string" ? value : ""}
      placeholder={option.placeholder}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function initialValues(
  options: CommandOption[],
  preset: CommandValues,
): CommandValues {
  const values: CommandValues = {};
  for (const option of options) {
    const presetValue = preset[option.key];
    values[option.key] =
      presetValue !== undefined ? presetValue : option.defaultValue;
  }
  return values;
}
