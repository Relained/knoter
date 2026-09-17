import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "../../shared/icons/Icon";
import {
  fontFamilyOptions,
  fontSizeBounds,
  getGlobalSettingsSnapshot,
  subscribeGlobalSettings,
  updateGlobalSettings,
  widgetBarWidthBounds,
} from "../../core/settings/preferences";
import type { DockPreference, FontFamilyPreference } from "../../core/settings/preferences";
import { useDialogDismiss } from "../hooks/useDialogDismiss";
import {
  chordFromEvent,
  formatChord,
  resetKeybindings,
  setKeybinding,
  type KeybindingMap,
} from "../commands/keybindings";
import type { WorkbenchCommand } from "../types";

const dynamicCommandPrefixes = ["open.doc.", "open.tab.", "pin.", "template.open."];

export function SettingsPageView({
  commands,
  keybindings,
  onClose,
}: {
  commands: WorkbenchCommand[];
  keybindings: KeybindingMap;
  onClose: () => void;
}) {
  const settings = useSyncExternalStore(
    subscribeGlobalSettings,
    getGlobalSettingsSnapshot,
    getGlobalSettingsSnapshot,
  );
  const dismiss = useDialogDismiss(onClose);

  return (
    <div
      className="settings-page-backdrop"
      onPointerDown={dismiss.onBackdropPointerDown}
    >
      <section
        className="settings-page"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        ref={dismiss.containerRef}
      >
        <header>
          <span>Settings</span>
          <button type="button" onClick={onClose} aria-label="Close settings">
            <Icon name="window.close" size={16} />
          </button>
        </header>
        <div className="settings-page-body">
          <section className="settings-section" aria-label="Layout settings">
            <h2>Layout</h2>
            <dl>
              <dt>Tab strip position</dt>
              <dd>
                <DockControl
                  value={settings.workbenchTabDock}
                  onChange={(workbenchTabDock) =>
                    updateGlobalSettings({ workbenchTabDock })
                  }
                />
              </dd>
              <dt>Widget bar width</dt>
              <dd>
                <NumberControl
                  value={settings.widgetBarWidth}
                  min={widgetBarWidthBounds.min}
                  max={widgetBarWidthBounds.max}
                  onChange={(widgetBarWidth) =>
                    updateGlobalSettings({ widgetBarWidth })
                  }
                />
              </dd>
            </dl>
          </section>
          <section className="settings-section" aria-label="Appearance settings">
            <h2>Appearance</h2>
            <dl>
              <dt>Base16 theme</dt>
              <dd>
                <input
                  value={settings.base16ThemeId}
                  onChange={(event) =>
                    updateGlobalSettings({
                      base16ThemeId: event.currentTarget.value,
                    })
                  }
                />
              </dd>
              <dt>Icon theme</dt>
              <dd>
                <input
                  value={settings.iconThemeId}
                  onChange={(event) =>
                    updateGlobalSettings({
                      iconThemeId: event.currentTarget.value,
                    })
                  }
                />
              </dd>
              <dt>UI font</dt>
              <dd>
                <FontFamilyControl
                  value={settings.uiFontFamily}
                  onChange={(uiFontFamily) =>
                    updateGlobalSettings({ uiFontFamily })
                  }
                />
              </dd>
              <dt>UI font size</dt>
              <dd>
                <NumberControl
                  value={settings.uiFontSize}
                  min={fontSizeBounds.ui.min}
                  max={fontSizeBounds.ui.max}
                  onChange={(uiFontSize) => updateGlobalSettings({ uiFontSize })}
                />
              </dd>
              <dt>Motion scale</dt>
              <dd>
                <NumberControl
                  value={settings.motionScale}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={(motionScale) =>
                    updateGlobalSettings({ motionScale })
                  }
                />
              </dd>
            </dl>
          </section>
          <section className="settings-section" aria-label="Editor settings">
            <h2>Editor</h2>
            <dl>
              <dt>Editor font</dt>
              <dd>
                <FontFamilyControl
                  value={settings.editorFontFamily}
                  onChange={(editorFontFamily) =>
                    updateGlobalSettings({ editorFontFamily })
                  }
                />
              </dd>
              <dt>Editor font size</dt>
              <dd>
                <NumberControl
                  value={settings.editorFontSize}
                  min={fontSizeBounds.editor.min}
                  max={fontSizeBounds.editor.max}
                  onChange={(editorFontSize) =>
                    updateGlobalSettings({ editorFontSize })
                  }
                />
              </dd>
            </dl>
          </section>
          <KeyboardShortcutsSection
            commands={commands}
            keybindings={keybindings}
          />
        </div>
      </section>
    </div>
  );
}

function KeyboardShortcutsSection({
  commands,
  keybindings,
}: {
  commands: WorkbenchCommand[];
  keybindings: KeybindingMap;
}) {
  const [hint, setHint] = useState(
    "Click a shortcut to record a new chord. Backspace clears, Esc cancels.",
  );
  const bindableCommands = useMemo(
    () =>
      commands
        .filter(
          (command) =>
            !dynamicCommandPrefixes.some((prefix) =>
              command.id.startsWith(prefix),
            ),
        )
        .sort((a, b) => a.title.localeCompare(b.title)),
    [commands],
  );

  function assignChord(command: WorkbenchCommand, chord: string | null) {
    const displaced = setKeybinding(command.id, chord);
    if (!chord) {
      setHint(`${command.title}: shortcut cleared.`);
      return;
    }
    if (displaced) {
      const other = commands.find((item) => item.id === displaced);
      setHint(
        `${formatChord(chord)} moved from "${other?.title ?? displaced}" to "${command.title}".`,
      );
      return;
    }
    setHint(`${command.title}: ${formatChord(chord)}`);
  }

  return (
    <section className="settings-section" aria-label="Keyboard shortcuts">
      <h2>Keyboard Shortcuts</h2>
      <p className="settings-hint">{hint}</p>
      <div className="settings-shortcuts">
        {bindableCommands.map((command) => (
          <div className="settings-shortcut-row" key={command.id}>
            <span className="settings-shortcut-title">{command.title}</span>
            <ShortcutRecorder
              chord={keybindings[command.id] ?? null}
              onAssign={(chord) => assignChord(command, chord)}
              onClear={() => assignChord(command, null)}
            />
          </div>
        ))}
      </div>
      <button
        className="settings-shortcut-reset"
        type="button"
        onClick={() => {
          resetKeybindings();
          setHint("Shortcuts reset to defaults.");
        }}
      >
        Reset to Defaults
      </button>
    </section>
  );
}

function ShortcutRecorder({
  chord,
  onAssign,
  onClear,
}: {
  chord: string | null;
  onAssign: (chord: string) => void;
  onClear: () => void;
}) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    function onKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(false);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        onClear();
        setRecording(false);
        return;
      }
      const nextChord = chordFromEvent(event);
      if (!nextChord) return;
      onAssign(nextChord);
      setRecording(false);
    }
    // Capture phase so the global command dispatcher never sees these keys.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, onAssign, onClear]);

  return (
    <button
      className={`settings-shortcut-chord ${recording ? "is-recording" : ""}`}
      type="button"
      aria-label={recording ? "Recording shortcut" : "Edit shortcut"}
      onClick={() => setRecording((current) => !current)}
    >
      {recording ? "Press keys..." : chord ? formatChord(chord) : "Unbound"}
    </button>
  );
}

function DockControl({
  value,
  onChange,
}: {
  value: DockPreference;
  onChange: (value: DockPreference) => void;
}) {
  return (
    <div className="settings-segmented-control" role="group">
      <button
        className={value === "top" ? "is-selected" : ""}
        type="button"
        onClick={() => onChange("top")}
      >
        Top
      </button>
      <button
        className={value === "bottom" ? "is-selected" : ""}
        type="button"
        onClick={() => onChange("bottom")}
      >
        Bottom
      </button>
    </div>
  );
}

function FontFamilyControl({
  value,
  onChange,
}: {
  value: FontFamilyPreference;
  onChange: (value: FontFamilyPreference) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) =>
        onChange(event.currentTarget.value as FontFamilyPreference)
      }
    >
      {fontFamilyOptions.map((option) => (
        <option value={option} key={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function NumberControl({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
    />
  );
}
