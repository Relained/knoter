import { useSyncExternalStore } from "react";
import { getActiveBase16Theme } from "../../shared/theming/runtime";
import type { HtmlTab } from "../types";
import { createSandboxDocument } from "../utils/html";

function subscribeThemeChange(listener: () => void) {
  window.addEventListener("knoter:themechange", listener);
  return () => window.removeEventListener("knoter:themechange", listener);
}

export function HtmlPageView({
  tab,
  dailyNote,
  simpleNote,
  onDailyNote,
  onSimpleNote,
  onSaveNote,
  variant = "page",
}: {
  tab: HtmlTab | null;
  dailyNote: string;
  simpleNote: string;
  onDailyNote: (value: string) => void;
  onSimpleNote: (value: string) => void;
  onSaveNote?: (editor: "daily" | "simple") => void;
  variant?: "page" | "widget";
}) {
  // Sandbox srcDocs bake in theme colors, so rebuild them on theme change.
  useSyncExternalStore(
    subscribeThemeChange,
    getActiveBase16Theme,
    getActiveBase16Theme,
  );

  if (!tab) {
    return (
      <article className="empty-page">
        <p className="eyebrow">WORKSPACE</p>
        <h1>No Open Tabs</h1>
        <p>Open an artifact, source, or quick view.</p>
      </article>
    );
  }

  if (tab.kind === "daily-note") {
    return (
      <article className="editor-page">
        <header>
          <p className="eyebrow">SOURCE</p>
          <h1>Daily Note</h1>
          <p>Temporary source draft for today.</p>
          {onSaveNote && variant === "page" && (
            <button
              type="button"
              className="editor-save-button"
              onClick={() => onSaveNote("daily")}
            >
              Save to Vault
            </button>
          )}
        </header>
        <textarea
          value={dailyNote}
          onChange={(event) => onDailyNote(event.currentTarget.value)}
          aria-label="Daily Note editor"
          placeholder="Write today's note..."
        />
      </article>
    );
  }

  if (tab.kind === "note-editor") {
    return (
      <article className="editor-page">
        <header>
          <p className="eyebrow">SOURCE</p>
          <h1>Simple Note Editor</h1>
          <p>Quick local note surface.</p>
          {onSaveNote && variant === "page" && (
            <button
              type="button"
              className="editor-save-button"
              onClick={() => onSaveNote("simple")}
            >
              Save to Vault
            </button>
          )}
        </header>
        <textarea
          value={simpleNote}
          onChange={(event) => onSimpleNote(event.currentTarget.value)}
          aria-label="Simple note editor"
          placeholder="Write a simple note..."
        />
      </article>
    );
  }

  return (
    <iframe
      className="html-page-frame"
      title={tab.title}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={createSandboxDocument(tab.html, { compact: variant === "widget" })}
    />
  );
}
