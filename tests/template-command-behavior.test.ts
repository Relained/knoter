import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";

async function runCli(args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
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

function randomHome(): string {
  return join("/tmp", `kn-template-harness-${randomUUID()}`);
}

async function createActiveVault(
  knHome: string,
  vaultName: string,
  templateContent: string
): Promise<{ vaultRoot: string; vaultTemplatePath: string }> {
  const vaultRoot = join("/tmp", `kn-template-vault-${randomUUID()}`);
  const vaultKnDir = join(vaultRoot, ".kn");
  mkdirSync(vaultKnDir, { recursive: true });

  const configPath = join(knHome, "config.json");
  const config = {
    activeVault: vaultName,
    vaults: {
      [vaultName]: {
        name: vaultName,
        path: vaultRoot,
      },
    },
  };
  mkdirSync(knHome, { recursive: true });
  await Bun.write(configPath, JSON.stringify(config, null, 2));

  const vaultTemplatePath = join(vaultKnDir, "template.md");
  await Bun.write(vaultTemplatePath, templateContent);

  return { vaultRoot, vaultTemplatePath };
}

describe("template command behavior", () => {
  test("template get returns fallback contract in json", async () => {
    const knHome = randomHome();

    const result = await runCli(["--format", "json", "template", "get"], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const envelope = JSON.parse(result.stdout);

    expect(envelope).toEqual(
      expect.objectContaining({
        ok: true,
        command: "template get",
      })
    );

    expect(envelope.data).toEqual(
      expect.objectContaining({
        source: "fallback",
        path: expect.stringContaining("docs/template.md"),
        content: expect.stringContaining("# knoter Daily Report Template"),
      })
    );
  });

  test("template get includes parsed metadata from vault-local frontmatter", async () => {
    const knHome = randomHome();
    const templateContent = [
      "---",
      "title: Vault Daily Template",
      "version: 3",
      'meta:',
      '  scope: "daily"',
      '  tags: ["vault", "template"]',
      "---",
      "",
      "# Vault Daily Template",
      "",
      "This file includes vault-local frontmatter.",
    ].join("\n");
    const { vaultTemplatePath, vaultRoot } = await createActiveVault(knHome, "primary", templateContent);

    const result = await runCli(["--format", "json", "template", "get"], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const envelope = JSON.parse(result.stdout);

    expect(envelope).toEqual(
      expect.objectContaining({
        ok: true,
        command: "template get",
      })
    );
    expect(envelope.data).toEqual(
      expect.objectContaining({
        source: "vault",
        path: vaultTemplatePath,
        content: expect.stringContaining("# Vault Daily Template"),
        metadata: {
          title: "Vault Daily Template",
          version: 3,
          meta: {
            scope: "daily",
            tags: ["vault", "template"],
          },
        },
      })
    );

    rmSync(knHome, { recursive: true, force: true });
    rmSync(vaultRoot, { recursive: true, force: true });
  });

  test("template list returns single-template json envelope", async () => {
    const knHome = randomHome();

    const result = await runCli(["--format", "json", "template", "list"], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const envelope = JSON.parse(result.stdout);

    expect(envelope).toEqual(
      expect.objectContaining({
        ok: true,
        command: "template list",
      })
    );
    expect(envelope.data).toEqual(
      expect.objectContaining({
        source: "fallback",
        path: expect.stringContaining("docs/template.md"),
        content: expect.any(String),
      })
    );
  });

  test("template validate with custom absolute path returns valid path source", async () => {
    const knHome = randomHome();
    const templateDir = join("/tmp", `kn-template-custom-${randomUUID()}`);
    const templatePath = join(templateDir, "template.md");
    mkdirSync(templateDir, { recursive: true });
    await Bun.write(
      templatePath,
      `---\ntitle: "Custom Template"\nlevel: 1\n---\n\n# Custom Template\n\nThis is a valid template.`
    );

    const result = await runCli(["--format", "json", "template", "validate", templatePath], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const envelope = JSON.parse(result.stdout);

    expect(envelope).toEqual(
      expect.objectContaining({
        ok: true,
        command: "template validate",
      })
    );
    expect(envelope.data).toEqual(
      expect.objectContaining({
        source: "path",
        valid: true,
      })
    );
    expect(templatePath).toBe(envelope.data.path);
    expect(join(templatePath)).toBe(envelope.data.path);

    rmSync(templateDir, { recursive: true, force: true });
  });

  test("template validate flags malformed frontmatter opening without closing delimiter", async () => {
    const knHome = randomHome();
    const templateDir = join("/tmp", `kn-template-malformed-${randomUUID()}`);
    const templatePath = join(templateDir, "template.md");
    mkdirSync(templateDir, { recursive: true });

    await Bun.write(
      templatePath,
      `---\ntitle: Broken\n# Heading Inside Broken Frontmatter`
    );

    const result = await runCli(["--format", "json", "template", "validate", templatePath], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope).toEqual(
      expect.objectContaining({
        ok: true,
        command: "template validate",
      })
    );
    expect(envelope.data).toEqual(
      expect.objectContaining({
        source: "path",
        valid: false,
      })
    );

    const errorsText = (envelope.data.errors || []).join("\n");
    expect(errorsText).toContain("Invalid frontmatter:");
    expect(errorsText).toContain("closing delimiter is missing");

    rmSync(templateDir, { recursive: true, force: true });
  });

  test("template validate with missing path returns invalid with readable-style error", async () => {
    const knHome = randomHome();
    const missingPath = join("/tmp", `kn-template-missing-${randomUUID()}.md`);

    const result = await runCli(["--format", "json", "template", "validate", missingPath], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const envelope = JSON.parse(result.stdout);

    expect(envelope).toEqual(
      expect.objectContaining({
        ok: true,
        command: "template validate",
      })
    );
    expect(envelope.data).toEqual(
      expect.objectContaining({
        source: "path",
        valid: false,
      })
    );

    const errorsText = (envelope.data.errors || []).join("\n");
    expect(errorsText.toLowerCase()).toContain("unable to validate template");
    expect(errorsText.toLowerCase()).toContain("not readable");
  });

  test("template get prefers vault template over fallback when active vault has .kn/template.md", async () => {
    const knHome = randomHome();
    const vaultTemplateContent = [
      "---",
      "title: Vault Template",
      "---",
      "",
      "# Vault Selected Template",
      "This is the vault-local template content.",
    ].join("\n");
    const { vaultTemplatePath, vaultRoot } = await createActiveVault(knHome, "primary", vaultTemplateContent);

    const result = await runCli(["--format", "json", "template", "get"], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const envelope = JSON.parse(result.stdout);

    expect(envelope).toEqual(
      expect.objectContaining({
        ok: true,
        command: "template get",
      })
    );
    expect(envelope.data).toEqual(
      expect.objectContaining({
        source: "vault",
        path: vaultTemplatePath,
        content: expect.stringContaining("# Vault Selected Template"),
      })
    );
    expect(envelope.data.content).not.toContain("# knoter Daily Report Template");

    rmSync(knHome, { recursive: true, force: true });
    rmSync(vaultRoot, { recursive: true, force: true });
  });
});
