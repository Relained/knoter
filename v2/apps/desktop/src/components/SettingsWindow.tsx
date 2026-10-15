import { useEffect, useRef, useState } from 'react';
import {
  AppWindow,
  Check,
  Keyboard,
  Moon,
  Network,
  Palette,
  PenLine,
  RotateCcw,
  Settings2,
  Sun,
} from 'lucide-react';
import type { KnoterClient, WorkspaceSnapshot } from '@knoter/contracts';
import { DEFAULT_SUPPLEMENT_RATIO, type WindowFrame } from '@knoter/contracts/native';
import { Button } from './ui/button';
import { PopupWindow } from './ui/popup-window';
import { RatioField } from './RewriteDialog';
import {
  conflicts,
  eventBinding,
  formatBinding,
  resolveBindings,
  shortcutCommands,
  usableBinding,
  type ShortcutId,
} from '../shell/shortcuts';
import type { RunAction } from '../views/WikiView';

export type SettingsSection = 'appearance' | 'window' | 'writing' | 'shortcuts' | 'about';
const sections: { id: SettingsSection; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'window', label: 'Window', icon: AppWindow },
  { id: 'writing', label: 'Writing', icon: PenLine },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Network },
];

export function SettingsWindow({
  open,
  section,
  onSection,
  onOpenChange,
  snapshot,
  client,
  run,
  frame,
  onFrame,
}: {
  open: boolean;
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  onOpenChange: (open: boolean) => void;
  snapshot: WorkspaceSnapshot;
  client: KnoterClient;
  run: RunAction;
  /** The current window decoration, or null outside the desktop app. */
  frame: WindowFrame | null;
  onFrame: (frame: WindowFrame) => void;
}) {
  return (
    <PopupWindow
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      icon={<Settings2 size={14} />}
      className="settings-window"
    >
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? 'active' : ''}
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => onSection(item.id)}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {section === 'appearance' && (
            <section>
              <h2>Appearance</h2>
              <div className="theme-options">
                {(
                  [
                    {
                      theme: 'light',
                      name: 'Daylight',
                      description: 'A clear, quiet canvas.',
                      icon: Sun,
                    },
                    {
                      theme: 'dark',
                      name: 'Evening',
                      description: 'A softer place after dark.',
                      icon: Moon,
                    },
                  ] as const
                ).map((option) => (
                  <button
                    className={snapshot.settings.theme === option.theme ? 'theme-selected' : ''}
                    key={option.theme}
                    onClick={() => void run(() => client.updateSettings({ theme: option.theme }))}
                  >
                    <option.icon size={20} />
                    <strong>{option.name}</strong>
                    <span>{option.description}</span>
                    {snapshot.settings.theme === option.theme && <Check size={14} />}
                  </button>
                ))}
              </div>
            </section>
          )}
          {section === 'window' && (
            <section>
              <h2>Window</h2>
              <p className="settings-help">
                Choose who draws the title bar. knoter’s own title bar holds search and the window
                controls in one compact row; the system title bar keeps your operating system’s
                look. The window reopens to apply a change, after checking for unsaved edits.
              </p>
              <div className="theme-options">
                {(
                  [
                    {
                      frame: 'custom',
                      name: 'knoter title bar',
                      description: 'Drawn by the app, with search built in.',
                    },
                    {
                      frame: 'native',
                      name: 'System title bar',
                      description: 'Drawn by the operating system.',
                    },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.frame}
                    className={frame === option.frame ? 'theme-selected' : ''}
                    disabled={!frame}
                    onClick={() => frame !== option.frame && onFrame(option.frame)}
                  >
                    <AppWindow size={20} />
                    <strong>{option.name}</strong>
                    <span>{option.description}</span>
                    {frame === option.frame && <Check size={14} />}
                  </button>
                ))}
              </div>
              {!frame && (
                <p className="settings-help">
                  Window decoration is available in the desktop app. The browser preview always
                  shows knoter’s title bar.
                </p>
              )}
            </section>
          )}
          {section === 'writing' && (
            <WritingSettings snapshot={snapshot} client={client} run={run} />
          )}
          {section === 'shortcuts' && (
            <ShortcutsEditor snapshot={snapshot} client={client} run={run} />
          )}
          {section === 'about' && (
            <section>
              <h2>About</h2>
              <div className="about-demo">
                <span className="mini-logo">
                  <Network size={17} />
                </span>
                <div>
                  <strong>
                    knoter · {client.mode === 'connected' ? 'Wiki worker demo' : 'Frontend preview'}
                  </strong>
                  <p>
                    {client.mode === 'connected'
                      ? 'Markdown sources and wiki history live in the background service. Tasks and calendar are not connected in this demo.'
                      : 'Your changes stay in this browser. Chat and source processing are simulated; no LLM, vault, or background service is connected.'}
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </PopupWindow>
  );
}

function WritingSettings({
  snapshot,
  client,
  run,
}: {
  snapshot: WorkspaceSnapshot;
  client: KnoterClient;
  run: RunAction;
}) {
  const saved = snapshot.settings.supplementRatio ?? DEFAULT_SUPPLEMENT_RATIO;
  const [ratio, setRatio] = useState(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setRatio(saved), [saved]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <section>
      <h2>Writing</h2>
      <p className="settings-help">
        Your notes are the core of every page; supplements (보충) add definitions, background,
        examples, and corrections from the model’s knowledge and references it reads. Set how much
        of a page the supplements should make up. This applies to pages the background worker and
        Chat write from now on; use <strong>Rewrite</strong> on a page to rebalance it.
      </p>
      <RatioField
        value={ratio}
        onChange={(value) => {
          setRatio(value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(
            () => void run(() => client.updateSettings({ supplementRatio: value })),
            400,
          );
        }}
        label="Default supplement ratio"
      />
      {ratio !== DEFAULT_SUPPLEMENT_RATIO && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            setRatio(DEFAULT_SUPPLEMENT_RATIO);
            void run(() => client.updateSettings({ supplementRatio: DEFAULT_SUPPLEMENT_RATIO }));
          }}
        >
          <RotateCcw /> Reset to {DEFAULT_SUPPLEMENT_RATIO}%
        </Button>
      )}
    </section>
  );
}

function ShortcutsEditor({
  snapshot,
  client,
  run,
}: {
  snapshot: WorkspaceSnapshot;
  client: KnoterClient;
  run: RunAction;
}) {
  const overrides = snapshot.settings.shortcuts ?? {};
  const bindings = resolveBindings(overrides);
  const clashing = conflicts(bindings);
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [hint, setHint] = useState('');
  const save = (next: Record<string, string>) =>
    void run(() => client.updateSettings({ shortcuts: next }));
  const assign = (id: ShortcutId, binding: string) => {
    const fallback = shortcutCommands.find((c) => c.id === id)!.binding;
    const next = { ...overrides };
    if (binding === fallback) delete next[id];
    else next[id] = binding;
    save(next);
  };
  const groups = [...new Set(shortcutCommands.map((c) => c.group))];
  return (
    <section>
      <h2>
        Shortcuts
        {Object.keys(overrides).length > 0 && (
          <Button variant="ghost" size="xs" onClick={() => save({})}>
            <RotateCcw /> Reset all
          </Button>
        )}
      </h2>
      <p className="settings-help">
        Select a shortcut, then press the new keys. Use ⌘ or Ctrl, or Alt, so typing is not
        interrupted. Backspace removes a shortcut; Escape cancels. Keys an editor uses, such as bold
        in the note editor, keep working there.
      </p>
      {hint && (
        <p className="settings-warning" role="status">
          {hint}
        </p>
      )}
      {groups.map((group) => (
        <div className="shortcut-group" key={group}>
          <h3>{group}</h3>
          {shortcutCommands
            .filter((c) => c.group === group)
            .map((command) => {
              const binding = bindings[command.id];
              const clash = clashing.has(command.id)
                ? shortcutCommands
                    .filter((c) => c.id !== command.id && bindings[c.id] === binding)
                    .map((c) => c.label)
                : [];
              return (
                <div className="shortcut-row" key={command.id}>
                  <span>
                    {command.label}
                    {clash.length > 0 && <small>Also used by {clash.join(', ')}</small>}
                  </span>
                  <button
                    className={`shortcut-key ${recording === command.id ? 'recording' : ''} ${clash.length ? 'clash' : ''}`}
                    aria-label={`Change shortcut for ${command.label}`}
                    data-captures-escape={recording === command.id ? '' : undefined}
                    onClick={() => {
                      setHint('');
                      setRecording(recording === command.id ? null : command.id);
                    }}
                    onBlur={() => setRecording(null)}
                    onKeyDown={(e) => {
                      if (recording !== command.id) return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.key === 'Escape') return setRecording(null);
                      if (e.key === 'Backspace' || e.key === 'Delete') {
                        assign(command.id, '');
                        return setRecording(null);
                      }
                      const next = eventBinding(e.nativeEvent);
                      if (!next) return;
                      if (!usableBinding(next)) {
                        setHint(
                          `${formatBinding(next)} would fire while typing. Add ⌘/Ctrl or Alt.`,
                        );
                        return;
                      }
                      setHint('');
                      assign(command.id, next);
                      setRecording(null);
                    }}
                  >
                    {recording === command.id
                      ? 'Press keys…'
                      : binding
                        ? formatBinding(binding)
                        : 'None'}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Reset shortcut for ${command.label}`}
                    title={`Reset to ${formatBinding(command.binding)}`}
                    disabled={!(command.id in overrides)}
                    onClick={() => assign(command.id, command.binding)}
                  >
                    <RotateCcw />
                  </Button>
                </div>
              );
            })}
        </div>
      ))}
    </section>
  );
}
