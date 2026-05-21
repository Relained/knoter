import type { KnotenApiClient } from "./graphApi";
import type { ExplorerItem, ExplorerLayer, GraphPayload } from "./types";

const now = new Date(0).toISOString();

const explorerItems: ExplorerItem[] = [
  createExplorerItem("template-dashboard", "template", "Dashboard", "templates/dashboard.md"),
  createExplorerItem("template-plan", "template", "Project Plan", "templates/project-plan.md"),
  createExplorerItem("template-research", "template", "Research Notes", "templates/research-notes.md")
];

const graphPayload: GraphPayload = {
  vaultId: "mock",
  generatedAt: now,
  nodes: [
    { id: "template:dashboard", type: "template", label: "Dashboard", metadata: {} },
    { id: "template:project-plan", type: "template", label: "Project Plan", metadata: {} }
  ],
  edges: []
};

export const mockKnotenApi: KnotenApiClient = {
  vault: {
    async getActive() {
      return {
        id: "mock",
        name: "Mock Vault",
        root: ".",
        active: true
      };
    },
    async switch(vaultId: string) {
      return {
        id: vaultId,
        name: vaultId,
        root: ".",
        active: true
      };
    }
  },
  explorer: {
    async list(input) {
      const query = input.query?.trim().toLowerCase() ?? "";
      const layers = new Set<ExplorerLayer>(input.layers);
      return explorerItems.filter((item) => {
        if (!layers.has(item.layer)) return false;
        if (!query) return true;
        return `${item.title} ${item.path} ${item.kind ?? ""}`.toLowerCase().includes(query);
      });
    },
    async read(input) {
      const item = explorerItems.find((entry) => entry.path === input.path);
      return {
        title: item?.title ?? "Mock Document",
        path: input.path,
        layer: item?.layer ?? "source",
        content: `# ${item?.title ?? "Mock Document"}\n\n${input.path}`
      };
    },
    async refresh() {
      return {
        vaultId: "mock",
        itemCount: explorerItems.length,
        refreshedAt: now,
        cachePath: null
      };
    }
  },
  graph: {
    async get() {
      return graphPayload;
    },
    async refresh() {
      return {
        vaultId: graphPayload.vaultId,
        nodeCount: graphPayload.nodes.length,
        edgeCount: graphPayload.edges.length,
        refreshedAt: now,
        cachePath: null
      };
    }
  },
  search: {
    async query(input) {
      const items = await mockKnotenApi.explorer.list({
        layers: input.layers ?? ["source", "rewritten", "template"],
        query: input.query
      });
      return items.map((item, index) => ({
        id: item.id,
        title: item.title,
        path: item.path,
        layer: item.layer,
        score: 1 - index * 0.1,
        snippet: item.path
      }));
    }
  }
};

function createExplorerItem(id: string, layer: ExplorerLayer, title: string, path: string): ExplorerItem {
  return {
    id,
    layer,
    title,
    path,
    kind: null,
    docDate: null,
    updatedAt: null,
    graphNodeId: null
  };
}
