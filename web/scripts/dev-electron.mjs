import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const devUrl = "http://127.0.0.1:39281";
const processes = [];
const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const repoRoot = join(webRoot, "..");
const cliRoot = join(repoRoot, "cli");
const devKnHome = process.env.KN_HOME ?? join(cliRoot, ".test-kn-home");
const devEnv = {
  ...process.env,
  KN_HOME: devKnHome
};

if (process.env.KNOTER_DEV_TEST_VAULT !== "0") {
  await runCliTestEnvEnsure({ required: process.env.KNOTER_DEV_TEST_VAULT === "1" });
}

if (!(await isServerReady(devUrl))) {
  const vite = spawn("npm", ["run", "dev:renderer"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: devEnv
  });
  processes.push(vite);

  vite.on("exit", (code) => {
    if (code !== 0 && processes.includes(vite)) {
      shutdown();
      process.exit(code ?? 1);
    }
  });
}

try {
  await waitForServer(devUrl, 30_000);
} catch (error) {
  shutdown();
  throw error;
}

const electron = spawn("npm", ["run", "dev:electron"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...devEnv,
    KNOTER_DEV_SERVER_URL: devUrl
  }
});
processes.push(electron);

electron.on("exit", (code) => {
  shutdown();
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(143);
});

function runCliTestEnvEnsure({ required }) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["scripts/test-env.sh", "ensure"], {
      cwd: cliRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: devEnv
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const error = new Error(`CLI test vault bootstrap failed with code ${code ?? 1}`);
      if (required) {
        reject(error);
        return;
      }
      console.warn(`Warning: ${error.message}. Continuing without a bootstrapped CLI test vault.`);
      resolve();
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReady(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function isServerReady(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function shutdown() {
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
}
