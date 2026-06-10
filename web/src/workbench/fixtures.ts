import type { HtmlTab, SourceDraft, ToolItem } from "./types";

export const initialSourceDraft: SourceDraft = {
  title: "",
  mediaType: "text/markdown",
  fileNames: [],
  privacy: "public",
  timeScope: "permanent",
  wikiPolicy: "ask"
};

export const menuToolItems: ToolItem[] = [
  { key: "artifacts", label: "Artifacts", icon: "artifact.list" },
  { key: "source", label: "Source", icon: "document.new" },
  { key: "search", label: "Search", icon: "command.search" }
];

export const quickAccessToolItems: ToolItem[] = [
  { key: "daily", label: "Daily Note", icon: "document.new" },
  { key: "calendar", label: "Calendar", icon: "object.calendar" },
  { key: "todo", label: "Todo", icon: "object.todo" }
];

export const systemToolItems: ToolItem[] = [
  { key: "notifications", label: "Notifications", icon: "notification.bell" },
  { key: "settings", label: "Settings", icon: "settings.open" }
];

export const builtinViews: Record<string, HtmlTab> = {
  "llm-wiki": {
    id: "llm-wiki",
    title: "LLM Wiki",
    kind: "artifact",
    label: "Artifact",
    html: `
      <article>
        <p class="eyebrow">LLM WIKI</p>
        <h1>Artifact: LLM Wiki - Project Overview</h1>
        <p>LLM Wiki is the pinned long-term artifact for public, permanent project knowledge. It is the default search and reasoning layer.</p>
        <section>
          <h2>Current Structure</h2>
          <ul>
            <li>Source is the raw user input layer.</li>
            <li>Artifact is the agent-authored output layer.</li>
            <li>HTML artifacts can be opened as page tabs, floating panels, or isolated Electron windows.</li>
          </ul>
        </section>
        <section>
          <h2>Project Files</h2>
          <pre>sources/
  daily/
  papers/
artifacts/
  llm-wiki/
  reports/
templates/</pre>
        </section>
      </article>
    `
  },
  calendar: {
    id: "calendar",
    title: "Calendar",
    kind: "artifact",
    label: "Calendar",
    html: `
      <article>
        <p class="eyebrow">CALENDAR</p>
        <h1>Calendar</h1>
        <p>Temporary source dates, daily notes, and agent refresh points are shown here.</p>
        <section>
          <h2>Today</h2>
          <ul>
            <li>Daily Note source draft</li>
            <li>Pending source extraction review</li>
            <li>Artifact refresh window</li>
          </ul>
        </section>
      </article>
    `
  },
  todo: {
    id: "todo",
    title: "Todo",
    kind: "artifact",
    label: "Todo",
    html: `
      <article>
        <p class="eyebrow">TODO</p>
        <h1>Todo</h1>
        <p>Temporary tasks and short-lived action items are collected here.</p>
        <section>
          <h2>Today</h2>
          <ul>
            <li>Review queued sources</li>
            <li>Refresh active artifacts</li>
            <li>Promote durable notes into LLM Wiki when policy allows</li>
          </ul>
        </section>
      </article>
    `
  },
  "daily-note": {
    id: "daily-note",
    title: "Daily Note",
    kind: "daily-note",
    label: "Source",
    html: ""
  },
  "simple-note": {
    id: "simple-note",
    title: "Simple Note",
    kind: "note-editor",
    label: "Source",
    html: ""
  }
};

export const initialTabs: HtmlTab[] = [
  builtinViews["llm-wiki"],
  builtinViews["daily-note"]
];
