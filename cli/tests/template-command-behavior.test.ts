import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { randomTestPath } from "./helpers/test-paths";

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
  return randomTestPath("kn-template-harness");
}

async function createActiveVault(
  knHome: string,
  vaultName: string,
  templateContent: string
): Promise<{ vaultRoot: string; vaultTemplatePath: string }> {
  const vaultRoot = randomTestPath("kn-template-vault");
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
        content: expect.stringContaining("# knoter Artifact Workflow Template"),
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
    const templateDir = randomTestPath("kn-template-custom");
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
    const templateDir = randomTestPath("kn-template-malformed");
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
    const missingPath = `${randomTestPath("kn-template-missing")}.md`;

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
    const templateDir = randomTestPath("kn-template-missing-contract");
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
    const templateDir = randomTestPath("kn-template-missing-required");
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
    const templateDir = randomTestPath("kn-template-duplicate");
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

  test("template get with name returns bundled document template with html", async () => {
    const knHome = randomHome();

    const result = await runCli(["--format", "json", "template", "get", "llm-wiki"], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const envelope = JSON.parse(result.stdout);

    expect(envelope).toEqual(
      expect.objectContaining({ ok: true, command: "template get" })
    );
    expect(envelope.data).toEqual(
      expect.objectContaining({
        name: "llm-wiki",
        source: "bundled",
        kind: "llm-wiki",
        path: expect.stringContaining(join("templates", "llm-wiki.md")),
        content: expect.stringContaining("# LLM Wiki"),
        html: expect.stringContaining("<article>"),
      })
    );

    rmSync(knHome, { recursive: true, force: true });
  });

  test("template get with name prefers vault override under .kn/templates", async () => {
    const knHome = randomHome();
    const { vaultRoot } = await createActiveVault(knHome, "primary", "# workflow");
    const overrideDir = join(vaultRoot, ".kn", "templates");
    mkdirSync(overrideDir, { recursive: true });
    await Bun.write(
      join(overrideDir, "todo.md"),
      ["---", "kind: todo", "name: Vault Todo", "---", "", "# Vault Todo Skeleton"].join("\n")
    );

    const result = await runCli(["--format", "json", "template", "get", "todo"], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.data).toEqual(
      expect.objectContaining({
        name: "todo",
        source: "vault",
        content: expect.stringContaining("# Vault Todo Skeleton"),
        html: null,
      })
    );

    rmSync(knHome, { recursive: true, force: true });
    rmSync(vaultRoot, { recursive: true, force: true });
  });

  test("template get with unknown name fails with error envelope", async () => {
    const knHome = randomHome();

    const result = await runCli(
      ["--format", "json", "template", "get", "no-such-template"],
      { KN_HOME: knHome }
    );

    expect(result.code).not.toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.ok).toBe(false);

    rmSync(knHome, { recursive: true, force: true });
  });

  test("template list includes bundled document templates with legacy fields", async () => {
    const knHome = randomHome();

    const result = await runCli(["--format", "json", "template", "list"], {
      KN_HOME: knHome,
    });

    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.stdout);

    expect(envelope.data).toEqual(
      expect.objectContaining({
        source: "fallback",
        path: expect.stringContaining("docs/template.md"),
      })
    );
    const names = envelope.data.templates.map(
      (template: { name: string }) => template.name
    );
    expect(names).toEqual(
      expect.arrayContaining(["llm-wiki", "calendar", "todo", "kanban"])
    );
    for (const template of envelope.data.templates) {
      expect(template).toEqual(
        expect.objectContaining({ source: "bundled", hasHtml: true })
      );
    }

    rmSync(knHome, { recursive: true, force: true });
  });

  test("template scaffold writes starter artifacts and skips existing on rerun", async () => {
    const knHome = randomHome();
    const { vaultRoot } = await createActiveVault(knHome, "primary", "# workflow");

    const first = await runCli(["--format", "json", "template", "scaffold"], {
      KN_HOME: knHome,
    });
    expect(first.code).toBe(0);
    const firstEnvelope = JSON.parse(first.stdout);
    const createdNames = firstEnvelope.data.created
      .map((entry: { name: string }) => entry.name)
      .sort();
    expect(createdNames).toEqual(["calendar", "kanban", "llm-wiki", "todo"]);
    expect(existsSync(join(vaultRoot, "artifacts", "kanban.md"))).toBe(true);

    const second = await runCli(["--format", "json", "template", "scaffold"], {
      KN_HOME: knHome,
    });
    expect(second.code).toBe(0);
    const secondEnvelope = JSON.parse(second.stdout);
    expect(secondEnvelope.data.created).toEqual([]);
    expect(secondEnvelope.data.skipped.length).toBe(4);

    rmSync(knHome, { recursive: true, force: true });
    rmSync(vaultRoot, { recursive: true, force: true });
  });
});
