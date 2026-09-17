// Minimal dev orchestrator: start Vite on 127.0.0.1:39281, wait until it
// serves, then launch the Electron shell pointed at it. No test-vault
// bootstrap — the IPC bridge uses the active vault from ~/.kn (or KN_HOME).
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const devServerUrl = "http://127.0.0.1:39281";

const children = [];

function run(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: webRoot,
    stdio: "inherit",
    env: { ...process.env, ...env }
  });
  children.push(child);
  child.on("exit", (code) => shutdown(code ?? 0));
  return child;
}

function shutdown(code) {
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { method: "HEAD" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(`Vite dev server did not start at ${url}`);
}

run("npx", ["vite", "--host", "127.0.0.1"]);
await waitForServer(devServerUrl);
run("npx", ["electron", "."], { KNOTER_DEV_SERVER_URL: devServerUrl });
