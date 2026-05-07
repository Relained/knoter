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
      [
        "---",
        'id: "custom-template"',
        'name: "Custom Template"',
        "version: 1",
        'kind: "daily-report"',
        'locale: "ko-KR"',
        "requiredSections:",
        '  - "Summary"',
        "requiredVariables:",
        '  - "date"',
        "variables:",
        "  date:",
        '    description: "Target date"',
        "---",
        "",
        "# Custom Template",
        "",
        "## Summary",
        "Report for {{date}}.",
      ].join("\n")
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
        checks: expect.arrayContaining([
          expect.objectContaining({ name: "frontmatter.id", status: "pass" }),
          expect.objectContaining({ name: "content.requiredSections", status: "pass" }),
          expect.objectContaining({ name: "content.requiredVariables", status: "pass" }),
        ]),
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

  test("template validate enforces required frontmatter fields when frontmatter exists", async () => {
    const knHome = randomHome();
    const templateDir = join("/tmp", `kn-template-missing-contract-${randomUUID()}`);
    const templatePath = join(templateDir, "template.md");
    mkdirSync(templateDir, { recursive: true });

    await Bun.write(
      templatePath,
      [
        "---",
        'id: "missing-name-version"',
        "---",
        "",
        "# Missing Contract",
      ].join("\n")
    );

    const result = await runCli(["--format", "json", "template", "validate", templatePath], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.data.valid).toBe(false);
    const errorsText = (envelope.data.errors || []).join("\n");
    expect(errorsText).toContain("Template frontmatter requires non-empty name");
    expect(errorsText).toContain("Template frontmatter requires non-empty version");
    expect(envelope.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "frontmatter.name", status: "fail" }),
        expect.objectContaining({ name: "frontmatter.version", status: "fail" }),
      ])
    );

    rmSync(templateDir, { recursive: true, force: true });
  });

  test("template validate reports missing required sections and variables", async () => {
    const knHome = randomHome();
    const templateDir = join("/tmp", `kn-template-missing-required-${randomUUID()}`);
    const templatePath = join(templateDir, "template.md");
    mkdirSync(templateDir, { recursive: true });

    await Bun.write(
      templatePath,
      [
        "---",
        'id: "missing-required"',
        'name: "Missing Required"',
        "version: 1",
        "requiredSections:",
        '  - "Summary"',
        '  - "Workout"',
        "requiredVariables:",
        '  - "date"',
        '  - "open_task"',
        "---",
        "",
        "# Missing Required",
        "",
        "## Summary",
        "Report for {{date}}.",
      ].join("\n")
    );

    const result = await runCli(["--format", "json", "template", "validate", templatePath], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.data.valid).toBe(false);
    const errorsText = (envelope.data.errors || []).join("\n");
    expect(errorsText).toContain("Template is missing required section(s): Workout");
    expect(errorsText).toContain("Template is missing required variable placeholder(s): open_task");

    rmSync(templateDir, { recursive: true, force: true });
  });

  test("template validate rejects duplicate sections and invalid variable declarations", async () => {
    const knHome = randomHome();
    const templateDir = join("/tmp", `kn-template-duplicate-${randomUUID()}`);
    const templatePath = join(templateDir, "template.md");
    mkdirSync(templateDir, { recursive: true });

    await Bun.write(
      templatePath,
      [
        "---",
        'id: "duplicate-template"',
        'name: "Duplicate Template"',
        "version: 1",
        "variables: not-a-map-or-list",
        "---",
        "",
        "# Duplicate Template",
        "",
        "## Summary",
        "First.",
        "",
        "## Summary",
        "Second.",
      ].join("\n")
    );

    const result = await runCli(["--format", "json", "template", "validate", templatePath], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.data.valid).toBe(false);
    const errorsText = (envelope.data.errors || []).join("\n");
    expect(errorsText).toContain("Template contains duplicate section heading(s): summary");
    expect(errorsText).toContain("Template frontmatter variables must be an array of strings or object map");

    rmSync(templateDir, { recursive: true, force: true });
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
