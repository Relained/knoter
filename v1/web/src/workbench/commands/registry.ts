import type { KnotenApiClient } from "../../core/api/graphApi";
import type {
  DocumentTemplate,
  DocumentTemplateSummary,
  ExplorerItem,
  SearchResult,
  TemplateInfo,
  VaultStatus,
  VaultSummary,
} from "../../core/api/types";
import { builtinViews } from "../fixtures";
import type {
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
  documentTemplates: DocumentTemplateSummary[];
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
const searchScopes = ["llm-wiki", "artifacts", "sources", "all"] as const;
const noteEditors = ["daily", "simple"] as const;

export function buildWorkbenchCommands(ctx: CommandContext): WorkbenchCommand[] {
  return [
    ...backendCommands(ctx),
    ...uiCommands(ctx),
    ...pinCommands(ctx),
    ...openTabCommands(ctx),
    ...explorerDocumentCommands(ctx),
    ...documentTemplateCommands(ctx),
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
          key: "scope",
          label: "Scope",
          type: "enum",
          enumValues: [...searchScopes],
          defaultValue: "llm-wiki",
        },
      ],
      run: async (values) => {
        const api = requireApi(ctx);
        if (!api) return;
        const query = stringValue(values.query);
        const mode = enumValue(values.mode, searchModes, "hybrid");
        const scope = enumValue(values.scope, searchScopes, "llm-wiki");
        ctx.pushStatus(`Searching: ${query} (${mode}, ${scope})`);
        const results = await api.search.query({ query, mode, scope });
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
          placeholder: "default: ~/Documents/<name>",
        },
        {
          key: "sourceFolder",
          label: "Source folder",
          type: "string",
          placeholder: "folder of .md files to bulk add (optional)",
        },
      ],
      run: async (values) => {
        const api = requireApi(ctx);
        if (!api) return;
        const name = stringValue(values.name);
        const directory = stringValue(values.directory);
        const sourceFolder = stringValue(values.sourceFolder);
        ctx.closeVaultModal();
        const operationId = ctx.beginOperation(`Create vault: ${name}`);
        try {
          ctx.pushStatus(`Creating vault: ${name}...`);
          const vault = await api.vault.create({ name, directory: directory || null });
          ctx.pushStatus(`Vault created and activated: ${vault.name} (templates seeded).`);
          if (sourceFolder) {
            ctx.pushStatus(`Adding sources from ${sourceFolder}...`);
            const added = await api.source.addFromFolder({ path: sourceFolder });
            ctx.pushStatus(`Sources added: ${added.filesAdded} file(s) indexed.`);
          }
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
      run: async () => {
        const api = requireApi(ctx);
        if (!api) return;
        const operationId = ctx.beginOperation("Add source files");
        try {
          ctx.pushStatus("Choose source files in the file picker...");
          const result = await api.source.addFromPicker();
          if (result.canceled) {
            ctx.pushStatus("Add source canceled.");
            return;
          }
          ctx.pushStatus(`Sources added: ${result.filesAdded} file(s) indexed.`);
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
        const result = await api.note.save({ fileName, content });
        ctx.pushStatus(`Note saved to vault: ${result.filePath} (${result.status}).`);
        await ctx.refreshVaultData();
      },
    },
    {
      id: "template.get",
      title: "Open Workflow Contract",
      detail: "backend template",
      icon: "artifact.list",
      run: async () => {
        const api = requireApi(ctx);
        if (!api) return;
        const template = await api.template.get();
        ctx.upsertTab({
          id: "template-workflow",
          title: "Workflow Contract",
          kind: "artifact",
          label: "Template",
          html: templateHtml(template),
        });
        ctx.pushStatus(`Workflow contract loaded: ${template.path}.`);
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
        const templates = await api.template.list();
        ctx.upsertTab({
          id: "template-list",
          title: "Templates",
          kind: "artifact",
          label: "Template",
          html: templateListHtml(templates),
        });
        ctx.pushStatus(`Loaded ${templates.length} template file(s).`);
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

function documentTemplateCommands(ctx: CommandContext): WorkbenchCommand[] {
  return ctx.documentTemplates.map((template) => ({
    id: `template.open.${template.name}`,
    title: `Template: ${template.name}`,
    detail: "vault template",
    icon: "artifact.list",
    run: async () => {
      const api = requireApi(ctx);
      if (!api) return;
      const doc = await api.template.getDocument({ name: template.name });
      ctx.upsertTab({
        id: `template:${doc.name}`,
        title: doc.name,
        kind: "artifact",
        label: "Template",
        html: documentTemplateHtml(doc),
      });
      ctx.pushStatus(`Template loaded: ${doc.name}.`);
    },
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
        <dt>artifacts</dt><dd>${status.artifactCount}</dd>
        <dt>pending agent work</dt><dd>${status.pendingWorkCount}</dd>
        <dt>last indexed</dt><dd>${escapeHtml(status.lastIndexedAt ?? "never")}</dd>
        <dt>last sync</dt><dd>${escapeHtml(status.lastSyncAt ?? "never")}</dd>
        <dt>embedding model</dt><dd>${escapeHtml(status.embeddingModel ?? "none")}</dd>
      </dl>
    </article>
  `;
}

function templateHtml(template: TemplateInfo): string {
  return `
    <article>
      <p class="eyebrow">TEMPLATE</p>
      <h1>Workflow Contract</h1>
      <p><code>${escapeHtml(template.path)}</code></p>
      ${markdownToHtml(template.content)}
    </article>
  `;
}

function templateListHtml(templates: DocumentTemplateSummary[]): string {
  const rows = templates
    .map(
      (entry) => `
        <tr>
          <td><strong>${escapeHtml(entry.name)}</strong></td>
          <td><code>${escapeHtml(entry.path)}</code></td>
          <td>${entry.hasHtml ? "yes" : "-"}</td>
        </tr>`,
    )
    .join("");
  return `
    <article>
      <p class="eyebrow">TEMPLATES</p>
      <h1>Vault Templates</h1>
      <p>${templates.length} template file(s) in <code>templates/</code>. Open one from the
         command palette ("Template: ..."). Edit the files directly to customize the
         agent's artifact contracts.</p>
      <table>
        <thead>
          <tr><th>Name</th><th>Path</th><th>Default HTML</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="3">No template files found.</td></tr>'}</tbody>
      </table>
    </article>
  `;
}

function documentTemplateHtml(doc: DocumentTemplate): string {
  // doc.html is the default display template; it flows through the same
  // sandbox sanitize path as every artifact tab.
  const htmlPreview = doc.html
    ? `<section><h2>Default HTML preview</h2>${doc.html}</section>`
    : "";
  return `
    <article>
      <p class="eyebrow">TEMPLATE</p>
      <h1>${escapeHtml(doc.name)}</h1>
      <p><code>${escapeHtml(doc.path)}</code></p>
      ${markdownToHtml(doc.content)}
      ${htmlPreview}
    </article>
  `;
}
