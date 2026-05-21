import { app, BrowserWindow, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, extname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const cliEntry = process.env.KNOTER_CLI_ENTRY ?? join(repoRoot, "cli", "src", "cli.ts");
const cliRunner = process.env.KNOTER_CLI_RUNNER ?? "bun";
const devServerUrl = process.env.KNOTER_DEV_SERVER_URL;

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
  ipcMain.handle("vault:getActive", async () => getActiveVaultSummary());
  ipcMain.handle("vault:switch", async (_event, input) => {
    await runCli(["vault", "switch", input.vaultId]);
    const active = await getActiveVaultSummary();
    if (!active) throw new Error(`Vault switch succeeded but active vault was not found: ${input.vaultId}`);
    return active;
  });
  ipcMain.handle("explorer:list", async (_event, input) => {
    const layers = new Set(input.layers ?? []);
    const query = input.query?.trim().toLowerCase() ?? "";
    const items = await loadExplorerItems();
    return items.filter((item) => {
      if (!layers.has(item.layer)) return false;
      if (!query) return true;
      return `${item.title} ${item.path} ${item.kind ?? ""}`.toLowerCase().includes(query);
    });
  });
  ipcMain.handle("explorer:refresh", async () => {
    const active = await getActiveVaultSummary();
    const items = await loadExplorerItems(active);
    return {
      vaultId: active?.id ?? "none",
      itemCount: items.length,
      refreshedAt: new Date().toISOString(),
      cachePath: null
    };
  });
  ipcMain.handle("graph:get", async (event, input) => buildGraphPayload(input));
  ipcMain.handle("graph:refresh", async () => {
    const graphPayload = await buildGraphPayload({ includeChunks: false });
    return {
      vaultId: graphPayload.vaultId,
      nodeCount: graphPayload.nodes.length,
      edgeCount: graphPayload.edges.length,
      refreshedAt: new Date().toISOString(),
      cachePath: null
    };
  });
  ipcMain.handle("search:query", async (_event, input) => {
    const args = [
      "search",
      input.query ?? "",
      "--mode",
      input.mode ?? "hybrid",
      "--top",
      "20"
    ];
    if (input.layers?.includes("template")) {
      return searchExplorerFallback(input);
    }
    const envelope = await runCli(args);
    return (envelope.data?.results ?? []).map((result) => ({
      id: String(result.id),
      title: result.title ?? result.filePath ?? "Untitled",
      path: result.filePath ?? "",
      layer: "rewritten",
      score: typeof result.score === "number" ? result.score : 0,
      snippet: result.content ?? result.heading ?? ""
    }));
  });
}

async function getActiveVaultSummary() {
  try {
    const envelope = await runCli(["vault", "status"]);
    const data = envelope.data;
    return {
      id: data.vault,
      name: data.vault,
      root: data.path,
      active: true
    };
  } catch (error) {
    if (String(error?.message ?? error).includes("No active vault")) return null;
    throw error;
  }
}

async function loadExplorerItems(activeVault) {
  const active = activeVault ?? await getActiveVaultSummary();
  const items = [];
  const template = await loadTemplateItem();
  if (template) items.push(template);
  if (!active) return items;

  items.push(...await listMarkdownLayer(active.root, "source", "sources"));
  items.push(...await listMarkdownLayer(active.root, "rewritten", "rewritten"));
  return items;
}

async function listMarkdownLayer(vaultRoot, layer, dirName) {
  const root = join(vaultRoot, dirName);
  const files = await listMarkdownFiles(root);
  return files.map((file) => {
    const relPath = relative(vaultRoot, file);
    const fileName = basename(file, extname(file));
    const docDate = relative(root, file).split(/[\\/]/)[0] ?? null;
    return createExplorerItem(`${layer}:${relPath}`, layer, fileName, relPath, {
      docDate: /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : null
    });
  });
}

async function listMarkdownFiles(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return listMarkdownFiles(path);
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) return [path];
      return [];
    }));
    return nested.flat();
  } catch {
    return [];
  }
}

async function loadTemplateItem() {
  try {
    const envelope = await runCli(["template", "get"]);
    const template = envelope.data;
    return createExplorerItem("template:effective", "template", template.metadata?.name ?? "Effective Template", template.path, {
      kind: template.metadata?.kind ?? null
    });
  } catch {
    return null;
  }
}

async function buildGraphPayload(input = {}) {
  const active = await getActiveVaultSummary();
  const items = await loadExplorerItems(active);
  const includeChunks = !!input?.includeChunks;
  return {
    vaultId: active?.id ?? "none",
    generatedAt: new Date().toISOString(),
    nodes: items
      .filter((item) => includeChunks || item.layer !== "source")
      .map((item) => ({
        id: item.graphNodeId ?? item.id,
        type: item.layer === "template" ? "template" : "note",
        label: item.title,
        layer: item.layer === "template" ? undefined : item.layer,
        metadata: {
          path: item.path,
          kind: item.kind,
          docDate: item.docDate
        }
      })),
    edges: []
  };
}

async function searchExplorerFallback(input) {
  const query = (input.query ?? "").trim().toLowerCase();
  const layers = new Set(input.layers ?? ["source", "rewritten", "template"]);
  return (await loadExplorerItems())
    .filter((item) => layers.has(item.layer))
    .filter((item) => !query || `${item.title} ${item.path}`.toLowerCase().includes(query))
    .map((item, index) => ({
      id: item.id,
      title: item.title,
      path: item.path,
      layer: item.layer,
      score: 1 - index * 0.05,
      snippet: item.path
    }));
}

function createExplorerItem(id, layer, title, path, options = {}) {
  return {
    id,
    layer,
    title,
    path,
    kind: options.kind ?? null,
    docDate: options.docDate ?? null,
    updatedAt: options.updatedAt ?? null,
    graphNodeId: `${layer}:${path}`
  };
}

async function runCli(args) {
  const childArgs = [cliEntry, "--format", "json", ...args];
  const { stdout, stderr, code } = await spawnToCompletion(cliRunner, childArgs, {
    cwd: join(repoRoot, "cli")
  });

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`CLI returned non-JSON output: ${stderr || stdout}`);
  }

  if (code !== 0 || !parsed.ok) {
    const message = parsed?.error?.message ?? stderr ?? `CLI exited with code ${code}`;
    throw new Error(message);
  }

  return parsed;
}

function spawnToCompletion(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}
