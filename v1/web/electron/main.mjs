import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  buildSearchCliArgs,
  toSearchResult,
  validateExplorerLayers,
  validateNonEmptyString,
  validateNoteFileName,
  validateOptionalString,
  validateTemplateName,
  validateVaultName
} from "./cli-contract.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const v1Root = join(__dirname, "..", "..");
const cliEntry = process.env.KNOTER_CLI_ENTRY ?? join(v1Root, "cli", "src", "cli.ts");
const cliRunner = process.env.KNOTER_CLI_RUNNER ?? "bun";
const devServerUrl = process.env.KNOTER_DEV_SERVER_URL;
const cliTimeoutMs = Number.parseInt(process.env.KNOTER_CLI_TIMEOUT_MS ?? "30000", 10);
const cliIndexTimeoutMs = 120_000;
let mainWindow = null;

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
    // macOS: hide the system title bar; traffic lights are pulled down so
    // their center (y + 6) sits on the top tab bar row (top 14 + half of the
    // 38px tab pill = 33). The renderer provides the drag region.
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hidden", trafficLightPosition: { x: 18, y: 27 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.on("enter-full-screen", () => win.webContents.send("shell:fullscreen-changed", true));
  win.on("leave-full-screen", () => win.webContents.send("shell:fullscreen-changed", false));

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
    const vaultId = validateNonEmptyString(input?.vaultId, "Vault id");
    await runCli(["vault", "switch", vaultId]);
    const active = await getActiveVaultSummary();
    if (!active) throw new Error(`Vault switch succeeded but active vault was not found: ${vaultId}`);
    return active;
  });
  ipcMain.handle("explorer:list", async (_event, input) => {
    const layers = new Set(validateExplorerLayers(input?.layers, { allowEmpty: true, fallback: [] }));
    const query = validateOptionalString(input?.query, "Explorer query").toLowerCase();
    const items = await loadExplorerItems();
    return items.filter((item) => {
      if (!layers.has(item.layer)) return false;
      if (!query) return true;
      return `${item.title} ${item.path} ${item.kind ?? ""}`.toLowerCase().includes(query);
    });
  });
  ipcMain.handle("explorer:read", async (_event, input) => readExplorerItem(input));
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
    const { args } = buildSearchCliArgs(input);
    const envelope = await runCli(args);
    return (envelope.data?.results ?? []).map(toSearchResult);
  });
  ipcMain.handle("html:openWindow", async (_event, input) => openHtmlWindow(input));
  ipcMain.handle("vault:list", async () => {
    const envelope = await runCli(["vault", "list"]);
    return (envelope.data?.vaults ?? []).map((vault) => ({
      id: vault.name,
      name: vault.name,
      root: vault.path,
      active: !!vault.active
    }));
  });
  ipcMain.handle("vault:status", async () => {
    // vault status runs the implicit sync, so it doubles as the
    // "index whatever was dropped into the vault" trigger.
    const envelope = await runCli(["vault", "status"], { timeoutMs: cliIndexTimeoutMs });
    const data = envelope.data ?? {};
    const status = data.status ?? {};
    return {
      vault: data.vault ?? "unknown",
      path: data.path ?? "",
      noteCount: status.noteCount ?? 0,
      chunkCount: status.chunkCount ?? 0,
      pendingWorkCount: status.pendingWorkCount ?? 0,
      sourceCount: status.sourceCount ?? 0,
      artifactCount: status.artifactCount ?? 0,
      lastIndexedAt: status.lastIndexedAt ?? null,
      lastSyncAt: status.lastSyncAt ?? null,
      embeddingModel: status.embeddingModel ?? null
    };
  });
  ipcMain.handle("vault:create", async (_event, input) => createVaultFromInput(input));
  ipcMain.handle("dialog:pickDirectory", async (_event, input) => pickDirectory(input));
  ipcMain.handle("source:addFromPicker", async () => addSourcesFromPicker());
  ipcMain.handle("source:addFromFolder", async (_event, input) => addSourcesFromFolder(input));
  ipcMain.handle("note:save", async (_event, input) => saveNoteToVault(input));
  ipcMain.handle("template:get", async () => loadWorkflowTemplate());
  ipcMain.handle("template:list", async () => listTemplateFiles());
  ipcMain.handle("template:getDocument", async (_event, input) => loadDocumentTemplate(input));
}

async function createVaultFromInput(input) {
  const name = validateVaultName(input?.name);
  const directory = validateOptionalString(input?.directory, "Vault location");
  const args = ["vault", "init", name];
  if (directory) args.push("--path", join(directory, name));
  await runCli(args);
  await runCli(["vault", "switch", name]);
  const active = await getActiveVaultSummary();
  if (!active) throw new Error(`Vault was created but could not be activated: ${name}`);
  return active;
}

async function pickDirectory(input) {
  const title = validateOptionalString(input?.title, "Dialog title") || "Choose Folder";
  const picked = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title,
    properties: ["openDirectory", "createDirectory"]
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return { canceled: true, path: null };
  }
  return { canceled: false, path: picked.filePaths[0] };
}

// Sources enter the vault by direct file placement under sources/; the CLI's
// implicit pre-read sync indexes them and queues agent work. There is no
// kn add command.
async function addSourcesFromFolder(input) {
  const folder = validateNonEmptyString(input?.path, "Source folder path");
  const files = await listMarkdownFiles(resolve(folder));
  const details = await copyFilesIntoVaultSources(files);
  return {
    filesProcessed: files.length,
    filesAdded: details.length,
    details
  };
}

async function copyFilesIntoVaultSources(files) {
  if (files.length === 0) return [];
  const active = await getActiveVaultSummary();
  if (!active) throw new Error("No active vault found");

  const details = [];
  for (const file of files) {
    const name = basename(file);
    const datePart = inferDateFromName(name) ?? new Date().toISOString().slice(0, 10);
    const targetDir = join(active.root, "sources", datePart);
    await mkdir(targetDir, { recursive: true });
    await copyFile(file, join(targetDir, name));
    details.push({ filePath: join("sources", datePart, name), status: "added" });
  }

  // Trigger the implicit sync so the dropped files are indexed and queued.
  await runCli(["vault", "status"], { timeoutMs: cliIndexTimeoutMs });
  return details;
}

function inferDateFromName(name) {
  const match = name.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

async function addSourcesFromPicker() {
  const emptyResult = {
    canceled: true,
    filesProcessed: 0,
    filesAdded: 0,
    details: []
  };
  const picked = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "Add source files",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "txt"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (picked.canceled || picked.filePaths.length === 0) return emptyResult;

  const details = await copyFilesIntoVaultSources(picked.filePaths);
  return {
    canceled: false,
    filesProcessed: picked.filePaths.length,
    filesAdded: details.length,
    details
  };
}

async function saveNoteToVault(input) {
  const fileName = validateNoteFileName(input?.fileName);
  const content = validateNonEmptyString(input?.content, "Note content");

  const active = await getActiveVaultSummary();
  if (!active) throw new Error("No active vault found");

  const datePart = inferDateFromName(fileName) ?? new Date().toISOString().slice(0, 10);
  const targetDir = join(active.root, "sources", datePart);
  await mkdir(targetDir, { recursive: true });
  await writeFile(join(targetDir, fileName), content, "utf8");

  await runCli(["vault", "status"], { timeoutMs: cliIndexTimeoutMs });
  return {
    filePath: join("sources", datePart, fileName),
    status: "added"
  };
}

// Templates are plain files in <vault>/templates/ (seeded by `kn vault init`).
// The bridge reads them directly; there is no template CLI surface.

async function loadWorkflowTemplate() {
  const active = await getActiveVaultSummary();
  if (!active) throw new Error("No active vault found");
  const relPath = join("templates", "workflow.md");
  return {
    path: relPath,
    content: await readFile(join(active.root, relPath), "utf8")
  };
}

async function listTemplateFiles() {
  const active = await getActiveVaultSummary();
  if (!active) return [];
  const templatesDir = join(active.root, "templates");
  let entries;
  try {
    entries = await readdir(templatesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  return [...names]
    .filter((file) => file.toLowerCase().endsWith(".md"))
    .sort()
    .map((file) => {
      const name = file.slice(0, -3);
      return {
        name,
        path: join("templates", file),
        hasHtml: names.has(`${name}.html`)
      };
    });
}

async function loadDocumentTemplate(input) {
  const name = validateTemplateName(input?.name);
  const active = await getActiveVaultSummary();
  if (!active) throw new Error("No active vault found");
  const templatesDir = join(active.root, "templates");
  const mdPath = join(templatesDir, `${name}.md`);
  const htmlPath = join(templatesDir, `${name}.html`);
  const content = await readFile(mdPath, "utf8");
  let html = null;
  try {
    html = await readFile(htmlPath, "utf8");
  } catch {
    // No default HTML for this template.
  }
  return {
    name,
    path: join("templates", `${name}.md`),
    hasHtml: html !== null,
    content,
    html
  };
}

async function openHtmlWindow(input) {
  const title = validateNonEmptyString(input?.title, "HTML window title").slice(0, 120);
  const html = validateNonEmptyString(input?.html, "HTML window content");
  if (html.length > 1_000_000) throw new Error("HTML window content is too large");
  const theme = normalizeWindowTheme(input?.theme);

  const win = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 420,
    minHeight: 320,
    title,
    parent: mainWindow ?? undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createExternalHtmlDocument(html, theme))}`);
  return { opened: true };
}

// Fallback when the renderer sends no (or an invalid) theme snapshot.
const defaultWindowTheme = {
  mode: "dark",
  background: "#090909",
  surface: "#111111",
  border: "#303030",
  textPrimary: "#eeeeee",
  textSecondary: "#b8b8b8",
  textMuted: "#777777",
  accent: "#ff6a00",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
};

// Theme values are interpolated into an inline <style>, so only plain hex
// colors and a conservative font-family charset are accepted.
function normalizeWindowTheme(theme) {
  if (!theme || typeof theme !== "object") return defaultWindowTheme;
  return {
    mode: theme.mode === "light" ? "light" : "dark",
    background: hexColorOr(theme.background, defaultWindowTheme.background),
    surface: hexColorOr(theme.surface, defaultWindowTheme.surface),
    border: hexColorOr(theme.border, defaultWindowTheme.border),
    textPrimary: hexColorOr(theme.textPrimary, defaultWindowTheme.textPrimary),
    textSecondary: hexColorOr(theme.textSecondary, defaultWindowTheme.textSecondary),
    textMuted: hexColorOr(theme.textMuted, defaultWindowTheme.textMuted),
    accent: hexColorOr(theme.accent, defaultWindowTheme.accent),
    fontFamily: fontFamilyOr(theme.fontFamily, defaultWindowTheme.fontFamily)
  };
}

function hexColorOr(value, fallback) {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
    ? value
    : fallback;
}

function fontFamilyOr(value, fallback) {
  if (typeof value !== "string") return fallback;
  const fontFamily = value.trim();
  return fontFamily.length > 0 && fontFamily.length <= 240 && /^[\w\s,'"-]+$/.test(fontFamily)
    ? fontFamily
    : fallback;
}

function createExternalHtmlDocument(html, theme) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: ${theme.mode}; font-family: ${theme.fontFamily}; }
      body { margin: 0; padding: 22px; color: ${theme.textPrimary}; background: ${theme.background}; line-height: 1.55; }
      h1, h2, h3 { line-height: 1.15; }
      p { color: ${theme.textSecondary}; }
      pre { overflow: auto; padding: 14px; border: 1px solid ${theme.border}; border-radius: 8px; background: ${theme.surface}; }
      .eyebrow { color: ${theme.accent}; font-size: 12px; font-weight: 700; text-transform: uppercase; }
      a { color: ${theme.accent}; }
    </style>
  </head>
  <body>${sanitizeHtmlFragment(html)}</body>
</html>`;
}

function sanitizeHtmlFragment(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(src|href)\s*=\s*("|')\s*(https?:|data:|javascript:)[^"']*\2/gi, "");
}

async function readExplorerItem(input) {
  const active = await getActiveVaultSummary();
  if (!active) throw new Error("No active vault found");
  const inputPath = validateNonEmptyString(input?.path, "Explorer item path");

  const items = await loadExplorerItems(active);
  const item = items.find((candidate) => candidate.path === inputPath);
  if (!item) throw new Error(`Explorer item not found: ${inputPath}`);

  const vaultRoot = resolve(active.root);
  const absolutePath = isAbsolute(item.path) ? item.path : resolve(vaultRoot, item.path);
  const relativePath = relative(vaultRoot, absolutePath);
  const outsideVault = relativePath === ".." || relativePath.startsWith(`..${sep}`);
  if (outsideVault) {
    throw new Error(`Explorer item is outside the active vault: ${item.path}`);
  }

  return {
    title: item.title,
    path: item.path,
    layer: item.layer,
    content: await readFile(absolutePath, "utf8")
  };
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
  if (!active) return items;

  for (const template of await listTemplateFiles()) {
    items.push(
      createExplorerItem(`template:${template.path}`, "template", template.name, template.path)
    );
  }
  items.push(...await listMarkdownLayer(active.root, "source", "sources"));
  items.push(...await listMarkdownLayer(active.root, "artifact", "artifacts"));
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

async function runCli(args, options = {}) {
  const lockRetries = 2;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await runCliOnce(args, options);
    } catch (error) {
      // The CLI bootstrap (test vault ensure) can briefly hold the SQLite lock.
      const lockBusy = String(error?.message ?? "").includes("database is locked");
      if (!lockBusy || attempt >= lockRetries) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 600 * (attempt + 1)));
    }
  }
}

async function runCliOnce(args, options = {}) {
  const childArgs = [cliEntry, "--format", "json", ...args];
  const { stdout, stderr, code } = await spawnToCompletion(cliRunner, childArgs, {
    cwd: join(v1Root, "cli"),
    timeoutMs: options.timeoutMs
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
    let settled = false;
    let timedOut = false;
    let killTimeout = null;
    const { timeoutMs: timeoutOverride, ...spawnOptions } = options ?? {};
    const fallbackTimeoutMs = Number.isFinite(cliTimeoutMs) && cliTimeoutMs > 0 ? cliTimeoutMs : 30000;
    const timeoutMs = Number.isFinite(timeoutOverride) && timeoutOverride > 0
      ? timeoutOverride
      : fallbackTimeoutMs;
    const child = spawn(command, args, {
      ...spawnOptions,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const timeout = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      child.kill("SIGTERM");
      killTimeout = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 1500);
    }, timeoutMs);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimeout) clearTimeout(killTimeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimeout) clearTimeout(killTimeout);
      if (timedOut) {
        reject(new Error(`CLI command timed out after ${timeoutMs}ms`));
        return;
      }
      resolve({ stdout, stderr, code });
    });
  });
}
