import { describe, expect, test } from "bun:test";

async function runCli(args: string[], env?: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: env ? { ...process.env, ...env } : process.env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { code, stdout, stderr };
}

describe("CLI help surface", () => {
  test("get exposes explicit batch subcommand", async () => {
    const result = await runCli(["get", "batch", "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: kn get batch");
    expect(result.stdout).toContain("<targets...>");
  });

  test("template command help is exposed", async () => {
    const result = await runCli(["template", "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: kn template");
    expect(result.stdout).toContain("get");
    expect(result.stdout).toContain("validate");
  });

  test("template get and validate subcommands expose usage", async () => {
    const getHelp = await runCli(["template", "get", "--help"]);
    const validateHelp = await runCli(["template", "validate", "--help"]);

    expect(getHelp.code).toBe(0);
    expect(getHelp.stdout).toContain("Usage: kn template get");
    expect(validateHelp.code).toBe(0);
    expect(validateHelp.stdout).toContain("Usage: kn template validate");
  });

  test("report context help is exposed with required options", async () => {
    const reportHelp = await runCli(["report", "context", "--help"]);

    expect(reportHelp.code).toBe(0);
    expect(reportHelp.stdout).toContain("Usage: kn report context");
    expect(reportHelp.stdout).toContain("--date <YYYY-MM-DD>");
    expect(reportHelp.stdout).toContain("--layer <source|rewritten|artifact|all>");
    expect(reportHelp.stdout).toContain("--top <n>");
    expect(reportHelp.stdout).toContain("--include-artifacts");
  });

  test("template validate respects --format json", async () => {
    const result = await runCli(["--format", "json", "template", "validate"], {
      KN_HOME: "/tmp/knoter-template-home",
    });

    expect(result.code).toBe(0);

    const envelope = JSON.parse(result.stdout);
    expect(envelope).toHaveProperty("ok", true);
    expect(envelope).toHaveProperty("command", "template validate");
    expect(envelope.data).toHaveProperty("valid");
  });

  test("removed commands are not exposed in top-level help", async () => {
    const result = await runCli(["--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("tag");
    expect(result.stdout).not.toContain("cluster");
    expect(result.stdout).not.toContain("tag auto");
  });

  test("schedule is marked legacy while code remains present", async () => {
    const result = await runCli(["schedule", "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Legacy scheduler");
  });

  test("search help exposes deprecated threshold alias", async () => {
    const result = await runCli(["search", "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--threshold <f>");
  });
});
