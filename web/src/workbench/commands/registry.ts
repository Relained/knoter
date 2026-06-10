import type { KnotenApiClient } from "../../core/api/graphApi";
import type {
  ExplorerItem,
  SearchResult,
  TagInfo,
  TemplateInfo,
  VaultStatus,
  VaultSummary,
} from "../../core/api/types";
import { builtinViews } from "../fixtures";
import type {
  CommandValues,
  HtmlTab,
  WorkbenchCommand,
} from "../types";
import { escapeHtml } from "../utils/html";
import { markdownToHtml } from "../utils/markdown";

export type CommandContext = {
  api: KnotenApiClient | null;
  tabs: HtmlTab[];
  activeTab: HtmlTab | null;
  explorerItems: ExplorerItem[];
  dailyNote: string;
  simpleNote: string;
  upsertTab: (tab: HtmlTab) => void;
  openTab: (tabId: string) => void;
  closeActiveTab: () => void;
  activateAdjacentTab: (direction: 1 | -1) => void;
  pinWidgetView: (viewId: string) => void;
  pushStatus: (status: string) => void;
  openSourceModal: () => void;
  openVaultModal: () => void;
  closeVaultModal: () => void;
  openSettings: () => void;
  openPalette: (query: string) => void;
  refreshVaultData: () => Promise<void>;
  beginAgentRun: () => boolean;
  endAgentRun: () => void;
  beginOperation: (label: string) => number;
  endOperation: (operationId: number) => void;
};

const searchModes = ["hybrid", "keyword", "semantic"] as const;
const llmAgents = ["codex", "claude"] as const;
const noteEditors = ["daily", "simple"] as const;

export function buildWorkbenchCommands(ctx: CommandContext): WorkbenchCommand[] {
  return [
    ...backendCommands(ctx),
    ...uiCommands(ctx),
    ...pinCommands(ctx),
    ...openTabCommands(ctx),
    ...explorerDocumentCommands(ctx),
  ];
}

function backendCommands(ctx: CommandContext): WorkbenchCommand[] {
  return [
    {
      id: "search.run",
      title: "Search Vault",
      detail: "backend search",
      icon: "command.search",
      options: [
        {
          key: "query",
          label: "Query",
          type: "string",
          required: true,
          placeholder: "search terms",
        },
        {
          key: "mode",
          label: "Mode",
          type: "enum",
          enumValues: [...searchModes],
          defaultValue: "hybrid",
        },
        {
          key: "includeArtifacts",
          label: "Include artifacts",
          type: "boolean",
          defaultValue: false,
        },
      ],
      run: async (values) => {
        const api = requireApi(ctx);
        if (!api) return;
        const query = stringValue(values.query);
        const mode = enumValue(values.mode, searchModes, "hybrid");
        const includeArtifacts = values.includeArtifacts === true;
        ctx.pushStatus(`Searching: ${query} (${mode})`);
        const results = await api.search.query({ query, mode, includeArtifacts });
        ctx.upsertTab({
          id: "search-results",
          title: `Search: ${query}`,
          kind: "artifact",
          label: "Search",
          html: searchResultsHtml(query, mode, results),
        });
        ctx.pushStatus(`Search complete: ${results.length} result(s).`);
      },
    },
    {
      id: "sync.run",
      title: "Sync Vault Index",
      detail: "backend sync",
      icon: "agent.refresh",
      options: [
        { key: "full", label: "Full rebuild", type: "boolean", defaultValue: false },
        { key: "changed", label: "Changed files only", type: "boolean", defaultValue: false },
        { key: "prune", label: "Prune orphans only", type: "boolean", defaultValue: false },
      ],
      run: async (values) => {
        const api = requireApi(ctx);
        if (!api) return;
        const operationId = ctx.beginOperation("Sync vault index");
        try {
          ctx.pushStatus("Sync started...");
          const result = await api.sync.run({
            full: values.full === true,
            changed: values.changed === true,
            prune: values.prune === true,
          });
          const errorNote = result.errors.length > 0 ? `, errors: ${result.errors.length}` : "";
          ctx.pushStatus(
            `Sync complete: +${result.added} added, ${result.updated} updated, ${result.pruned} pruned${errorNote}.`,
          );
          await ctx.refreshVaultData();
        } finally {
          ctx.endOperation(operationId);
        }
      },
    },
    {
      id: "explorer.refresh",
      title: "Refresh Vault Explorer",
      detail: "backend explorer",
      icon: "agent.refresh",
      run: async () => {
        const api = requireApi(ctx);
        if (!api) return;
        await ctx.refreshVaultData();
        ctx.pushStatus("Explorer refreshed.");
      },
    },
    {
      id: "vault.list",
      title: "List Vaults",
      detail: "backend vault",
      icon: "artifact.list",
      run: async () => {
        const api = requireApi(ctx);
        if (!api) return;
        const vaults = await api.vault.list();
        ctx.upsertTab({
          id: "vault-list",
          title: "Vaults",
          kind: "artifact",
          label: "Vault",
          html: vaultListHtml(vaults),
        });
        ctx.pushStatus(`Loaded ${vaults.length} vault(s).`);
      },
    },
    {
      id: "vault.status",
      title: "Vault Status",
      detail: "backend vault",
      icon: "artifact.list",
      run: async () => {
        const api = requireApi(ctx);
        if (!api) return;
        const status = await api.vault.status();
        ctx.upsertTab({
          id: "vault-status",
          title: `Vault: ${status.vault}`,
          kind: "artifact",
          label: "Vault",
          html: vaultStatusHtml(status),
        });
        ctx.pushStatus(`Vault ${status.vault}: ${status.noteCount} notes indexed.`);
      },
    },
    {
      id: "vault.bootstrap",
      title: "Bootstrap Vault (create + import)",
      detail: "backend vault",
      icon: "artifact.list",
      options: [
        {
          key: "name",
          label: "Vault name",
          type: "string",
          required: true,
          placeholder: "my-vault",
        },
        {
          key: "directory",
          label: "Parent folder",
          type: "string",
          required: true,
          placeholder: "/absolute/path/to/parent",
        },
        {
          key: "sourceFolder",
          label: "Source folder",
          type: "string",
          placeholder: "folder of .md files to bulk add (optional)",
        },
        {
          key: "scaffold",
          label: "Create template documents",
          type: "boolean",
          defaultValue: true,
        },
      ],
      run: async (values) => {
        const api = requireApi(ctx);
        if (!api) return;
        const name = stringValue(values.name);
        const directory = stringValue(values.directory);
        const sourceFolder = stringValue(values.sourceFolder);
        const scaffold = values.scaffold !== false;
        ctx.closeVaultModal();
        const operationId = ctx.beginOperation(`Create vault: ${name}`);
        try {
          ctx.pushStatus(`Creating vault: ${name}...`);
          const vault = await api.vault.create({ name, directory });
          ctx.pushStatus(`Vault created and activated: ${vault.name}`);
          if (scaffold) {
            const scaffolded = await api.template.scaffold();
            ctx.pushStatus(
              `Template documents: ${scaffolded.created.length} created, ${scaffolded.skipped.length} skipped.`,
            );
          }
          if (sourceFolder) {
            ctx.pushStatus(`Adding sources from ${sourceFolder}...`);
            const added = await api.source.addFromFolder({ path: sourceFolder });
            ctx.pushStatus(
              `Sources added: ${added.filesAdded} added, ${added.filesUpdated} updated, ${added.filesSkipped} skipped.`,
            );
          }
          const sync = await api.sync.run({});
          const errorNote =
            sync.errors.length > 0 ? `, errors: ${sync.errors.length}` : "";
          ctx.pushStatus(
            `Index sync complete: +${sync.added} added, ${sync.updated} updated${errorNote}.`,
          );
          await ctx.refreshVaultData();
        } finally {
          ctx.endOperation(operationId);
        }
      },
    },
    {
      id: "vault.switch",
      title: "Switch Vault",
      detail: "backend vault",
      icon: "artifact.list",
      options: [
        {
          key: "name",
          label: "Vault name",
          type: "string",
          required: true,
          placeholder: "vault name from List Vaults",
        },
      ],
      run: async (values) => {
        const api = requireApi(ctx);
        if (!api) return;
        const name = stringValue(values.name);
        const vault = await api.vault.switch(name);
        ctx.pushStatus(`Switched to vault: ${vault.name}`);
        await ctx.refreshVaultData();
      },
    },
    {
      id: "source.add",
      title: "Add Source Files to Vault",
      detail: "backend source",
      icon: "document.new",
      options: [
        {
          key: "tags",
          label: "Tags",
          type: "string",
          placeholder: "tag1, tag2 (optional)",
        },
      ],
      run: async (values) => {
        const api = requireApi(ctx);
        if (!api) return;
        const operationId = ctx.beginOperation("Add source files");
        try {
          ctx.pushStatus("Choose source files in the file picker...");
          const result = await api.source.addFromPicker({ tags: parseTags(values.tags) });
          if (result.canceled) {
            ctx.pushStatus("Add source canceled.");
            return;
          }
          ctx.pushStatus(
            `Sources added: ${result.filesAdded} added, ${result.filesUpdated} updated, ${result.filesSkipped} skipped.`,
          );
          await ctx.refreshVaultData();
        } finally {
          ctx.endOperation(operationId);
        }
      },
    },
    {
      id: "note.save",
      title: "Save Note to Vault",
      detail: "backend source",
      icon: "document.new",
      options: [
        {
          key: "editor",
          label: "Editor",
          type: "enum",
          enumValues: [...noteEditors],
          defaultValue:
            ctx.activeTab?.kind === "note-editor" ? "simple" : "daily",
        },
        {
          key: "fileName",
          label: "File name",
          type: "string",
          placeholder: "defaults to <editor>-note-<today>.md",
        },
        {
          key: "tags",
          label: "Tags",
          type: "string",
          placeholder: "tag1, tag2 (optional)",
        },
      ],
      run: async (values) => {
        const api = requireApi(ctx);
        if (!api) return;
        const editor = enumValue(values.editor, noteEditors, "daily");
        const content = editor === "simple" ? ctx.simpleNote : ctx.dailyNote;
        if (!content.trim()) {
          ctx.pushStatus(`Nothing to save: the ${editor} note editor is empty.`);
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const fileName = stringValue(values.fileName) || `${editor}-note-${today}.md`;
        const result = await api.note.save({
          fileName,
          content,
          tags: parseTags(values.tags),
        });
        ctx.pushStatus(`Note saved to vault: ${result.filePath} (${result.status}).`);
        await ctx.refreshVaultData();
      },
    },
    {
      id: "template.get",
      title: "Open Effective Template",
      detail: "backend template",
      icon: "artifact.list",
      run: async () => {
        const api = requireApi(ctx);
        if (!api) return;
        const template = await api.template.get();
        ctx.upsertTab({
          id: "template-effective",
          title: template.metadata?.name ?? "Effective Template",
          kind: "artifact",
          label: "Template",
          html: templateHtml(template),
        });
        ctx.pushStatus(`Template loaded from ${template.source}.`);
      },
    },
    {
      id: "template.list",
      title: "List Templates",
      detail: "backend template",
      icon: "artifact.list",
      run: async () => {
        const api = requireApi(ctx);
        if (!api) return;
        const template = await api.template.list();
        ctx.upsertTab({
          id: "template-list",
          title: "Templates",
          kind: "artifact",
          label: "Template",
          html: templateHtml(template),
        });
        ctx.pushStatus(`Template source: ${template.source} (${template.path}).`);
      },
    },
    {
      id: "tag.list",
      title: "List Tags",
      detail: "backend tag",
      icon: "artifact.list",
      run: async () => {
        const api = requireApi(ctx);
        if (!api) return;
        const tags = await api.tag.list();
        ctx.upsertTab({
          id: "tag-list",
          title: "Tags",
          kind: "artifact",
          label: "Tag",
          html: tagListHtml(tags),
        });
        ctx.pushStatus(`Loaded ${tags.length} tag(s).`);
      },
    },
    {
      id: "tag.add",
      title: "Add Tags to Note",
      detail: "backend tag",
      icon: "artifact.list",
      options: [
        {
          key: "target",
          label: "Target note path",
          type: "string",
          required: true,
          placeholder: "sources/YYYY-MM-DD/note.md",
        },
        {
          key: "tags",
          label: "Tags",
          type: "string",
          required: true,
          placeholder: "tag1, tag2",
        },
      ],
      run: (values) => runTagUpdate(ctx, "add", values),
    },
    {
      id: "tag.remove",
      title: "Remove Tags from Note",
      detail: "backend tag",
      icon: "artifact.list",
      options: [
        {
          key: "target",
          label: "Target note path",
          type: "string",
          required: true,
          placeholder: "sources/YYYY-MM-DD/note.md",
        },
        {
          key: "tags",
          label: "Tags",
          type: "string",
          required: true,
          placeholder: "tag1, tag2",
        },
      ],
      run: (values) => runTagUpdate(ctx, "remove", values),
    },
    {
      id: "report.context",
      title: "Build Report Context",
      detail: "backend report",
      icon: "agent.refresh",
      options: [
        {
          key: "date",
          label: "Date",
          type: "string",
          required: true,
          defaultValue: new Date().toISOString().slice(0, 10),
          placeholder: "YYYY-MM-DD",
        },
        {
          key: "includeArtifacts",
          label: "Include artifacts",
          type: "boolean",
          defaultValue: false,
        },
      ],
      run: async (values) => {
        const api = requireApi(ctx);
        if (!api) return;
        const date = stringValue(values.date);
        const operationId = ctx.beginOperation(`Report context ${date}`);
        try {
          ctx.pushStatus(`Building report context for ${date}...`);
          const bundle = await api.report.context({
            date,
            includeArtifacts: values.includeArtifacts === true,
          });
          ctx.upsertTab({
            id: `report-context-${date}`,
            title: `Report Context ${date}`,
            kind: "artifact",
            label: "Report",
            html: jsonHtml(`Report Context ${date}`, bundle),
          });
          ctx.pushStatus(`Report context ready for ${date}.`);
        } finally {
          ctx.endOperation(operationId);
        }
      },
    },
    {
      id: "llm.rewrite",
      title: "Run Agent Rewrite",
      detail: "backend agent",
      icon: "agent.refresh",
      options: [
        {
          key: "source",
          label: "Source path",
          type: "string",
          required: true,
          placeholder: "sources/YYYY-MM-DD/note.md",
        },
        {
          key: "agent",
          label: "Agent",
          type: "enum",
          enumValues: [...llmAgents],
          defaultValue: "codex",
        },
      ],
      run: async (values) => {
        const api = requireApi(ctx);
        if (!api) return;
        if (!ctx.beginAgentRun()) {
          ctx.pushStatus("An agent rewrite is already running.");
          return;
        }
        const source = stringValue(values.source);
        const agent = enumValue(values.agent, llmAgents, "codex");
        const operationId = ctx.beginOperation(`Agent rewrite (${agent}): ${source}`);
        try {
          ctx.pushStatus(`Agent rewrite running (${agent}): ${source} — this can take minutes.`);
          const result = await api.llm.rewrite({ source, agent });
          const artifactPaths = result.artifacts.map((artifact) => artifact.path);
          ctx.pushStatus(
            `Rewrite complete (${result.agent}): ${result.artifacts.length} artifact(s) updated${
              artifactPaths.length > 0 ? ` — ${artifactPaths.join(", ")}` : ""
            }.`,
          );
          await ctx.refreshVaultData();
        } finally {
          ctx.endAgentRun();
          ctx.endOperation(operationId);
        }
      },
    },
  ];
}

function uiCommands(ctx: CommandContext): WorkbenchCommand[] {
  return [
    {
      id: "open.calendar",
      title: "Open Calendar",
      detail: "view",
      icon: "object.calendar",
      run: () => openBuiltinView(ctx, "calendar"),
    },
    {
      id: "open.todo",
      title: "Open Todo",
      detail: "view",
      icon: "object.todo",
      run: () => openBuiltinView(ctx, "todo"),
    },
    {
      id: "open.kanban",
      title: "Open Kanban",
      detail: "view",
      icon: "object.kanban",
      run: () => openBuiltinView(ctx, "kanban"),
    },
    {
      id: "vault.modal",
      title: "New Vault...",
      detail: "view",
      icon: "artifact.list",
      run: () => ctx.openVaultModal(),
    },
    {
      id: "open.daily-note",
      title: "Write Daily Note",
      detail: "view",
      icon: "document.new",
      run: () => openBuiltinView(ctx, "daily-note"),
    },
    {
      id: "open.simple-note",
      title: "Open Simple Note Editor",
      detail: "view",
      icon: "document.new",
      run: () => openBuiltinView(ctx, "simple-note"),
    },
    {
      id: "source.modal",
      title: "Draft Source Metadata",
      detail: "view",
      icon: "document.new",
      run: () => ctx.openSourceModal(),
    },
    {
      id: "settings.open",
      title: "Open Settings",
      detail: "settings",
      icon: "settings.open",
      run: () => ctx.openSettings(),
    },
    {
      id: "palette.open",
      title: "Browse All Commands",
      detail: "view",
      icon: "command.search",
      run: () => ctx.openPalette(""),
    },
    {
      id: "tab.close",
      title: "Close Active Tab",
      detail: "view",
      icon: "window.close",
      run: () => ctx.closeActiveTab(),
    },
    {
      id: "tab.next",
      title: "Next Tab",
      detail: "view",
      icon: "window.dock",
      run: () => ctx.activateAdjacentTab(1),
    },
    {
      id: "tab.prev",
      title: "Previous Tab",
      detail: "view",
      icon: "window.dock",
      run: () => ctx.activateAdjacentTab(-1),
    },
    {
      id: "palette.artifacts",
      title: "Open Artifact List",
      detail: "view",
      icon: "artifact.list",
      run: () => ctx.openPalette("artifact"),
    },
    {
      id: "template.create",
      title: "Create New Artifact Template",
      detail: "view",
      icon: "artifact.list",
      run: () => {
        ctx.upsertTab({
          id: `artifact-template-${Date.now()}`,
          title: "New Artifact Template",
          kind: "artifact",
          label: "Artifact",
          html: `
            <article>
              <p class="eyebrow">TEMPLATE</p>
              <h1>Create New Artifact Template</h1>
              <p>Define the HTML structure an agent should use for this artifact family.</p>
              <section><h2>Slots</h2><ul><li>Summary</li><li>Evidence</li><li>Actions</li></ul></section>
            </article>
          `,
        });
      },
    },
  ];
}

function pinCommands(ctx: CommandContext): WorkbenchCommand[] {
  return [...pinnableViews(ctx).values()].map((view) => ({
    id: `pin.${view.id}`,
    title: `Pin to Widget Bar: ${view.title}`,
    detail: "widget",
    icon: "widget.pin",
    run: () => ctx.pinWidgetView(view.id),
  }));
}

function openTabCommands(ctx: CommandContext): WorkbenchCommand[] {
  return ctx.tabs.map((tab) => ({
    id: `open.tab.${tab.id}`,
    title: `[${tab.label}] ${tab.title}`,
    detail: `open ${tab.kind}`,
    icon: tab.kind === "source" ? "document.new" : "artifact.list",
    run: () => ctx.openTab(tab.id),
  }));
}

function explorerDocumentCommands(ctx: CommandContext): WorkbenchCommand[] {
  return ctx.explorerItems.map((item) => ({
    id: `open.doc.${item.path}`,
    title: `Open: ${item.title}`,
    detail: `${item.layer} document`,
    icon: item.layer === "source" ? "document.new" : "artifact.list",
    run: async () => {
      const api = requireApi(ctx);
      if (!api) return;
      const doc = await api.explorer.read({ path: item.path });
      ctx.upsertTab({
        id: `doc:${doc.path}`,
        title: doc.title,
        kind: doc.layer === "source" ? "source" : "artifact",
        label: capitalize(doc.layer),
        html: markdownToHtml(doc.content),
      });
      ctx.pushStatus(`Opened ${doc.layer} document: ${doc.path}`);
    },
  }));
}

function pinnableViews(ctx: CommandContext): Map<string, HtmlTab> {
  const views = new Map<string, HtmlTab>();
  for (const view of Object.values(builtinViews)) views.set(view.id, view);
  for (const tab of ctx.tabs) views.set(tab.id, tab);
  return views;
}

function openBuiltinView(ctx: CommandContext, viewId: string) {
  const view = builtinViews[viewId];
  if (view) ctx.upsertTab(view);
}

async function runTagUpdate(
  ctx: CommandContext,
  action: "add" | "remove",
  values: CommandValues,
) {
  const api = requireApi(ctx);
  if (!api) return;
  const target = stringValue(values.target);
  const tags = parseTags(values.tags);
  if (tags.length === 0) {
    ctx.pushStatus("At least one tag is required.");
    return;
  }
  await api.tag.update({ action, target, tags });
  ctx.pushStatus(`Tags ${action === "add" ? "added to" : "removed from"} ${target}: ${tags.join(", ")}`);
}

function requireApi(ctx: CommandContext): KnotenApiClient | null {
  if (!ctx.api) {
    ctx.pushStatus("Backend bridge not available — run through the Electron dev shell (npm run dev).");
    return null;
  }
  return ctx.api;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function enumValue<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function parseTags(value: unknown): string[] {
  return stringValue(value)
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

function searchResultsHtml(query: string, mode: string, results: SearchResult[]): string {
  const rows = results
    .map(
      (result) => `
        <section>
          <h2>${escapeHtml(result.title)}</h2>
          <p><code>${escapeHtml(result.path)}</code> · ${escapeHtml(result.layer)} · score ${result.score.toFixed(3)}</p>
          <p>${escapeHtml(result.snippet)}</p>
        </section>`,
    )
    .join("");
  return `
    <article>
      <p class="eyebrow">SEARCH</p>
      <h1>Search: ${escapeHtml(query)}</h1>
      <p>${results.length} result(s), mode: ${escapeHtml(mode)}. Open documents from the command palette ("Open: ...").</p>
      ${rows || "<p>No results.</p>"}
    </article>
  `;
}

function vaultListHtml(vaults: VaultSummary[]): string {
  const rows = vaults
    .map(
      (vault) => `
        <li>
          <strong>${escapeHtml(vault.name)}</strong>${vault.active ? " (active)" : ""}
          <br /><code>${escapeHtml(vault.root)}</code>
        </li>`,
    )
    .join("");
  return `
    <article>
      <p class="eyebrow">VAULT</p>
      <h1>Vaults</h1>
      <ul>${rows || "<li>No vaults found.</li>"}</ul>
      <p>Switch with the "Switch Vault" command.</p>
    </article>
  `;
}

function vaultStatusHtml(status: VaultStatus): string {
  return `
    <article>
      <p class="eyebrow">VAULT</p>
      <h1>Vault Status: ${escapeHtml(status.vault)}</h1>
      <dl>
        <dt>path</dt><dd><code>${escapeHtml(status.path)}</code></dd>
        <dt>notes</dt><dd>${status.noteCount}</dd>
        <dt>chunks</dt><dd>${status.chunkCount}</dd>
        <dt>sources</dt><dd>${status.sourceCount}</dd>
        <dt>rewritten</dt><dd>${status.rewrittenCount}</dd>
        <dt>artifacts</dt><dd>${status.artifactCount}</dd>
        <dt>tags</dt><dd>${status.tagCount}</dd>
        <dt>last indexed</dt><dd>${escapeHtml(status.lastIndexedAt ?? "never")}</dd>
        <dt>embedding model</dt><dd>${escapeHtml(status.embeddingModel ?? "none")}</dd>
      </dl>
    </article>
  `;
}

function tagListHtml(tags: TagInfo[]): string {
  const rows = tags
    .map((tag) => `<li><strong>${escapeHtml(tag.tag)}</strong> · ${tag.count}</li>`)
    .join("");
  return `
    <article>
      <p class="eyebrow">TAGS</p>
      <h1>Tags</h1>
      <ul>${rows || "<li>No tags found.</li>"}</ul>
    </article>
  `;
}

function templateHtml(template: TemplateInfo): string {
  const name = template.metadata?.name ?? "Template";
  return `
    <article>
      <p class="eyebrow">TEMPLATE</p>
      <h1>${escapeHtml(name)}</h1>
      <p>source: ${escapeHtml(template.source)} · <code>${escapeHtml(template.path)}</code></p>
      ${markdownToHtml(template.content)}
    </article>
  `;
}

function jsonHtml(title: string, payload: unknown): string {
  return `
    <article>
      <p class="eyebrow">REPORT</p>
      <h1>${escapeHtml(title)}</h1>
      <pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
    </article>
  `;
}
