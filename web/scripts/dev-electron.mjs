import { spawn } from "node:child_process";

const devUrl = "http://127.0.0.1:39281";
const processes = [];

if (!(await isServerReady(devUrl))) {
  const vite = spawn("npm", ["run", "dev:renderer"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env
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
    ...process.env,
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
