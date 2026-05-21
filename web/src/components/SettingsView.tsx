import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import type { FontFamilyPreference, GlobalSettings } from "../settings/preferences";
import {
  applyGlobalSettingsText,
  fontFamilyOptions,
  fontSizeBounds,
  getGlobalSettingsText,
  sidebarWidthBounds
} from "../settings/preferences";
import { builtInIconThemes } from "../icons/registry";
import { builtInBase16Schemes } from "../theming/base16";

type SettingsViewProps = {
  settings: GlobalSettings;
  onChangeSettings: (patch: Partial<GlobalSettings>) => void;
};

export function SettingsView({ settings, onChangeSettings }: SettingsViewProps) {
  const [configText, setConfigText] = useState(() => getGlobalSettingsText());
  const [status, setStatus] = useState("JSONC config loaded.");
  const [fileBridgeAvailable, setFileBridgeAvailable] = useState(() => Boolean(window.knoterConfig?.canUseFileBridge()));

  useEffect(() => {
    setConfigText(getGlobalSettingsText());
  }, [settings]);

  useEffect(() => {
    setFileBridgeAvailable(Boolean(window.knoterConfig?.canUseFileBridge()));
  }, []);

  function updateSidebarVisibility(event: ChangeEvent<HTMLInputElement>) {
    onChangeSettings({ sidebarCollapsed: !event.currentTarget.checked });
  }

  function updateSidebarWidth(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onChangeSettings({ sidebarWidth: parsed });
  }

  function updateMotionScale(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onChangeSettings({ motionScale: parsed });
  }

  function updateUiFontSize(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onChangeSettings({ uiFontSize: parsed });
  }

  function updateEditorFontSize(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onChangeSettings({ editorFontSize: parsed });
  }

  function updateFontStack(family: FontFamilyPreference, value: string) {
    onChangeSettings({
      fontStacks: {
        ...settings.fontStacks,
        [family]: value
      }
    });
  }

  function reloadConfigText() {
    setConfigText(getGlobalSettingsText());
    setStatus("JSONC config reloaded.");
  }

  function applyConfigText() {
    const result = applyGlobalSettingsText(configText);
    if (result.ok) {
      setStatus("JSONC config applied.");
      return;
    }

    setStatus("JSONC config has a syntax error.");
  }

  async function loadConfigFile() {
    const result = await window.knoterConfig?.syncFromFile();
    if (result?.ok) {
      setConfigText(getGlobalSettingsText());
      setStatus("Loaded knoter.config.jsonc.");
      return;
    }

    setStatus("Config file bridge is not available.");
  }

  async function saveConfigFile() {
    const result = await window.knoterConfig?.syncToFile();
    setStatus(result?.ok ? "Saved knoter.config.jsonc." : "Config file bridge is not available.");
  }

  return (
    <article className="viewer settings-view" tabIndex={0}>
      <header className="settings-header">
        <h1>Settings</h1>
      </header>

      <section className="settings-section" aria-labelledby="settings-layout-title">
        <h2 id="settings-layout-title">Layout</h2>
        <label className="settings-row">
          <span>
            <strong>Sidebar</strong>
            <small>Show or hide the workspace sidebar.</small>
          </span>
          <input type="checkbox" checked={!settings.sidebarCollapsed} onChange={updateSidebarVisibility} />
        </label>

        <label className="settings-row">
          <span>
            <strong>Sidebar width</strong>
            <small>{settings.sidebarWidth}px</small>
          </span>
          <span className="settings-inline-control">
            <input
              type="range"
              min={sidebarWidthBounds.min}
              max={sidebarWidthBounds.max}
              value={settings.sidebarWidth}
              onChange={(event) => updateSidebarWidth(event.currentTarget.value)}
            />
            <input
              type="number"
              min={sidebarWidthBounds.min}
              max={sidebarWidthBounds.max}
              value={settings.sidebarWidth}
              onChange={(event) => updateSidebarWidth(event.currentTarget.value)}
            />
          </span>
        </label>
      </section>

      <section className="settings-section" aria-labelledby="settings-appearance-title">
        <h2 id="settings-appearance-title">Appearance</h2>
        <label className="settings-row">
          <span>
            <strong>Base16 theme</strong>
            <small>Applied immediately through the theme runtime.</small>
          </span>
          <select
            value={settings.base16ThemeId}
            onChange={(event) => onChangeSettings({ base16ThemeId: event.currentTarget.value })}
          >
            {builtInBase16Schemes.map((scheme) => (
              <option key={scheme.id} value={scheme.id}>{scheme.name}</option>
            ))}
          </select>
        </label>

        <label className="settings-row">
          <span>
            <strong>Icon theme</strong>
            <small>Prepared for runtime icon set switching.</small>
          </span>
          <select
            value={settings.iconThemeId}
            onChange={(event) => onChangeSettings({ iconThemeId: event.currentTarget.value })}
          >
            {Object.values(builtInIconThemes).map((theme) => (
              <option key={theme.id} value={theme.id}>{theme.name}</option>
            ))}
          </select>
        </label>

        <label className="settings-row">
          <span>
            <strong>Interface font</strong>
            <small>Font family used by app chrome and general UI.</small>
          </span>
          <select
            value={settings.uiFontFamily}
            onChange={(event) => onChangeSettings({ uiFontFamily: event.currentTarget.value as FontFamilyPreference })}
          >
            {fontFamilyOptions.map((family) => (
              <option key={family} value={family}>{family}</option>
            ))}
          </select>
        </label>

        <label className="settings-row">
          <span>
            <strong>Interface font size</strong>
            <small>{settings.uiFontSize}px</small>
          </span>
          <span className="settings-inline-control">
            <input
              type="range"
              min={fontSizeBounds.ui.min}
              max={fontSizeBounds.ui.max}
              step={1}
              value={settings.uiFontSize}
              onChange={(event) => updateUiFontSize(event.currentTarget.value)}
            />
            <input
              type="number"
              min={fontSizeBounds.ui.min}
              max={fontSizeBounds.ui.max}
              value={settings.uiFontSize}
              onChange={(event) => updateUiFontSize(event.currentTarget.value)}
            />
          </span>
        </label>

        <label className="settings-row">
          <span>
            <strong>Editor font</strong>
            <small>Font family used by Markdown editors and code-like text areas.</small>
          </span>
          <select
            value={settings.editorFontFamily}
            onChange={(event) => onChangeSettings({ editorFontFamily: event.currentTarget.value as FontFamilyPreference })}
          >
            {fontFamilyOptions.map((family) => (
              <option key={family} value={family}>{family}</option>
            ))}
          </select>
        </label>

        <label className="settings-row">
          <span>
            <strong>Editor font size</strong>
            <small>{settings.editorFontSize}px</small>
          </span>
          <span className="settings-inline-control">
            <input
              type="range"
              min={fontSizeBounds.editor.min}
              max={fontSizeBounds.editor.max}
              step={1}
              value={settings.editorFontSize}
              onChange={(event) => updateEditorFontSize(event.currentTarget.value)}
            />
            <input
              type="number"
              min={fontSizeBounds.editor.min}
              max={fontSizeBounds.editor.max}
              value={settings.editorFontSize}
              onChange={(event) => updateEditorFontSize(event.currentTarget.value)}
            />
          </span>
        </label>

        <div className="settings-row settings-row-stacked">
          <span>
            <strong>Font stacks</strong>
            <small>Custom CSS font-family values used by each family choice.</small>
          </span>
          <div className="settings-stack-list">
            {fontFamilyOptions.map((family) => (
              <label className="settings-stack-field" key={family}>
                <span>{family}</span>
                <input
                  type="text"
                  value={settings.fontStacks[family]}
                  onChange={(event) => updateFontStack(family, event.currentTarget.value)}
                />
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-behavior-title">
        <h2 id="settings-behavior-title">Behavior</h2>
        <label className="settings-row">
          <span>
            <strong>Motion scale</strong>
            <small>{settings.motionScale.toFixed(2)}x</small>
          </span>
          <span className="settings-inline-control">
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={settings.motionScale}
              onChange={(event) => updateMotionScale(event.currentTarget.value)}
            />
            <input
              type="number"
              min={0}
              max={2}
              step={0.05}
              value={settings.motionScale}
              onChange={(event) => updateMotionScale(event.currentTarget.value)}
            />
          </span>
        </label>

        <label className="settings-row">
          <span>
            <strong>Keybinding profile</strong>
            <small>Runtime profile slot for future editable bindings.</small>
          </span>
          <select
            value={settings.keybindingProfile}
            onChange={(event) => onChangeSettings({ keybindingProfile: event.currentTarget.value })}
          >
            <option value="default">Default</option>
          </select>
        </label>
      </section>

      <section className="settings-section" aria-labelledby="settings-config-title">
        <div className="settings-section-header">
          <h2 id="settings-config-title">Global config</h2>
          <div className="settings-actions">
            <button type="button" onClick={() => void loadConfigFile()} disabled={!fileBridgeAvailable}>Load file</button>
            <button type="button" onClick={() => void saveConfigFile()} disabled={!fileBridgeAvailable}>Save file</button>
            <button type="button" onClick={reloadConfigText}>Reload</button>
            <button type="button" onClick={applyConfigText}>Apply</button>
          </div>
        </div>
        <textarea
          className="settings-config-text"
          value={configText}
          spellCheck={false}
          onChange={(event) => setConfigText(event.currentTarget.value)}
          aria-label="Global JSONC config"
        />
        <p className="settings-status">{status}</p>
      </section>
    </article>
  );
}
