import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const devServerUrl = process.env.KNOTER_DEV_SERVER_URL;

const explorerItems = [
  createExplorerItem("template-dashboard", "template", "Dashboard", "templates/dashboard.md"),
  createExplorerItem("template-plan", "template", "Project Plan", "templates/project-plan.md"),
  createExplorerItem("template-research", "template", "Research Notes", "templates/research-notes.md")
];

const graphPayload = {
  vaultId: "mock",
  generatedAt: new Date(0).toISOString(),
  nodes: [
    { id: "template:dashboard", type: "template", label: "Dashboard", metadata: {} },
    { id: "template:project-plan", type: "template", label: "Project Plan", metadata: {} }
  ],
  edges: []
};

app.whenReady().then(async () => {
  installIpcHandlers();
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

async function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "knoter",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (devServerUrl) {
    await win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await win.loadFile(join(__dirname, "..", "dist", "index.html"));
}

function installIpcHandlers() {
  ipcMain.handle("vault:getActive", async () => ({
    id: "mock",
    name: "Mock Vault",
    root: ".",
    active: true
  }));
  ipcMain.handle("vault:switch", async (_event, input) => ({
    id: input.vaultId,
    name: input.vaultId,
    root: ".",
    active: true
  }));
  ipcMain.handle("explorer:list", async (_event, input) => {
    const layers = new Set(input.layers ?? []);
    const query = input.query?.trim().toLowerCase() ?? "";
    return explorerItems.filter((item) => {
      if (!layers.has(item.layer)) return false;
      if (!query) return true;
      return `${item.title} ${item.path} ${item.kind ?? ""}`.toLowerCase().includes(query);
    });
  });
  ipcMain.handle("explorer:refresh", async () => ({
    vaultId: "mock",
    itemCount: explorerItems.length,
    refreshedAt: new Date(0).toISOString(),
    cachePath: null
  }));
  ipcMain.handle("graph:get", async () => graphPayload);
  ipcMain.handle("graph:refresh", async () => ({
    vaultId: graphPayload.vaultId,
    nodeCount: graphPayload.nodes.length,
    edgeCount: graphPayload.edges.length,
    refreshedAt: new Date(0).toISOString(),
    cachePath: null
  }));
  ipcMain.handle("search:query", async (_event, input) => {
    const query = input.query ?? "";
    return explorerItems
      .filter((item) => `${item.title} ${item.path}`.toLowerCase().includes(query.toLowerCase()))
      .map((item, index) => ({
        id: item.id,
        title: item.title,
        path: item.path,
        layer: item.layer,
        score: 1 - index * 0.1,
        snippet: item.path
      }));
  });
}

function createExplorerItem(id, layer, title, path) {
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
