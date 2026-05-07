import type { ParsedTemplate, TemplateSource } from "./template";

export interface TemplateValidationCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message?: string;
}

export interface TemplateValidationResult {
  source: TemplateSource;
  path: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: TemplateValidationCheck[];
}

const REQUIRED_FRONTMATTER_FIELDS = ["id", "name", "version"] as const;

export function validateTemplateContract(input: {
  source: TemplateSource;
  path: string;
  parsed: ParsedTemplate;
}): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: TemplateValidationCheck[] = [];
  const content = input.parsed.content;
  const metadata = input.parsed.metadata;

  addCheck(
    checks,
    "content.nonEmpty",
    content.trim().length > 0,
    errors,
    "Template content is empty",
  );
  addCheck(
    checks,
    "content.heading",
    hasMarkdownHeading(content),
    errors,
    "Template contains no markdown heading",
  );

  if (input.parsed.hasFrontmatter && input.parsed.frontmatterError) {
    const message = `Invalid frontmatter: ${input.parsed.frontmatterError}`;
    errors.push(message);
    checks.push({ name: "frontmatter.parse", status: "fail", message });
  } else if (input.parsed.hasFrontmatter) {
    checks.push({ name: "frontmatter.parse", status: "pass" });
  } else {
    warnings.push("Template has no frontmatter; contract metadata checks were skipped");
    checks.push({
      name: "frontmatter.present",
      status: "warn",
      message: "Template has no frontmatter; contract metadata checks were skipped",
    });
  }

  if (input.parsed.hasFrontmatter && metadata && !input.parsed.frontmatterError) {
    validateFrontmatterMetadata(metadata, content, errors, warnings, checks);
  }

  return {
    source: input.source,
    path: input.path,
    valid: errors.length === 0,
    errors,
    warnings,
    checks,
  };
}

export function buildUnableToValidateResult(input: {
  source: TemplateSource;
  path: string;
  message: string;
}): TemplateValidationResult {
  return {
    source: input.source,
    path: input.path || "(unknown)",
    valid: false,
    errors: [`Unable to validate template: ${input.message}`],
    warnings: [],
    checks: [
      {
        name: "template.readable",
        status: "fail",
        message: `Unable to validate template: ${input.message}`,
      },
    ],
  };
}

function validateFrontmatterMetadata(
  metadata: Record<string, unknown>,
  content: string,
  errors: string[],
  warnings: string[],
  checks: TemplateValidationCheck[],
): void {
  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    const value = metadata[field];
    const ok = field === "version"
      ? isNonEmptyString(value) || Number.isFinite(value)
      : isNonEmptyString(value);
    addCheck(
      checks,
      `frontmatter.${field}`,
      ok,
      errors,
      `Template frontmatter requires non-empty ${field}`,
    );
  }

  if ("kind" in metadata) {
    addCheck(
      checks,
      "frontmatter.kind",
      isNonEmptyString(metadata.kind),
      errors,
      "Template frontmatter kind must be a non-empty string when present",
    );
  }

  if ("locale" in metadata) {
    addCheck(
      checks,
      "frontmatter.locale",
      isNonEmptyString(metadata.locale),
      errors,
      "Template frontmatter locale must be a non-empty string when present",
    );
  }

  const headings = extractHeadings(content);
  validateDuplicateHeadings(headings, errors, checks);
  validateRequiredSections(metadata.requiredSections, headings, errors, warnings, checks);
  validateVariables(metadata.variables, content, errors, warnings, checks);
  validateRequiredVariables(metadata.requiredVariables, content, errors, warnings, checks);
}

function validateRequiredSections(
  value: unknown,
  headings: string[],
  errors: string[],
  warnings: string[],
  checks: TemplateValidationCheck[],
): void {
  if (value === undefined) {
    const message = "requiredSections is not declared";
    warnings.push(message);
    checks.push({
      name: "frontmatter.requiredSections",
      status: "warn",
      message,
    });
    return;
  }
  const sections = parseStringArray(value);
  if (!sections) {
    const message = "Template frontmatter requiredSections must be an array of non-empty strings";
    errors.push(message);
    checks.push({ name: "frontmatter.requiredSections", status: "fail", message });
    return;
  }

  const headingSet = new Set(headings.map(normalizeHeading));
  const missing = sections.filter((section) => !headingSet.has(normalizeHeading(section)));
  if (missing.length > 0) {
    const message = `Template is missing required section(s): ${missing.join(", ")}`;
    errors.push(message);
    checks.push({ name: "content.requiredSections", status: "fail", message });
    return;
  }
  checks.push({ name: "content.requiredSections", status: "pass" });
}

function validateRequiredVariables(
  value: unknown,
  content: string,
  errors: string[],
  warnings: string[],
  checks: TemplateValidationCheck[],
): void {
  if (value === undefined) {
    const message = "requiredVariables is not declared";
    warnings.push(message);
    checks.push({
      name: "frontmatter.requiredVariables",
      status: "warn",
      message,
    });
    return;
  }
  const variables = parseStringArray(value);
  if (!variables) {
    const message = "Template frontmatter requiredVariables must be an array of non-empty strings";
    errors.push(message);
    checks.push({ name: "frontmatter.requiredVariables", status: "fail", message });
    return;
  }

  const placeholders = extractPlaceholders(content);
  const missing = variables.filter((variable) => !placeholders.has(variable));
  if (missing.length > 0) {
    const message = `Template is missing required variable placeholder(s): ${missing.join(", ")}`;
    errors.push(message);
    checks.push({ name: "content.requiredVariables", status: "fail", message });
    return;
  }
  checks.push({ name: "content.requiredVariables", status: "pass" });
}

function validateVariables(
  value: unknown,
  content: string,
  errors: string[],
  warnings: string[],
  checks: TemplateValidationCheck[],
): void {
  if (value === undefined) return;

  const declared = Array.isArray(value)
    ? parseStringArray(value)
    : value && typeof value === "object"
      ? Object.keys(value)
      : null;
  if (!declared) {
    const message = "Template frontmatter variables must be an array of strings or object map";
    errors.push(message);
    checks.push({
      name: "frontmatter.variables",
      status: "fail",
      message,
    });
    return;
  }

  const placeholders = extractPlaceholders(content);
  const unused = declared.filter((variable) => !placeholders.has(variable));
  if (unused.length > 0) {
    const message = `Declared variable(s) not used in template body: ${unused.join(", ")}`;
    warnings.push(message);
    checks.push({ name: "content.variables", status: "warn", message });
    return;
  }
  checks.push({ name: "content.variables", status: "pass" });
}

function validateDuplicateHeadings(
  headings: string[],
  errors: string[],
  checks: TemplateValidationCheck[],
): void {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const heading of headings.map(normalizeHeading)) {
    if (seen.has(heading)) duplicate.add(heading);
    seen.add(heading);
  }

  if (duplicate.size > 0) {
    const message = `Template contains duplicate section heading(s): ${Array.from(duplicate).join(", ")}`;
    errors.push(message);
    checks.push({ name: "content.duplicateSections", status: "fail", message });
    return;
  }
  checks.push({ name: "content.duplicateSections", status: "pass" });
}

function addCheck(
  checks: TemplateValidationCheck[],
  name: string,
  pass: boolean,
  errors: string[],
  errorMessage: string,
): void {
  if (pass) {
    checks.push({ name, status: "pass" });
    return;
  }
  errors.push(errorMessage);
  checks.push({ name, status: "fail", message: errorMessage });
}

function hasMarkdownHeading(content: string): boolean {
  return /^#{1,6}\s+.+$/m.test(content);
}

function extractHeadings(content: string): string[] {
  return Array.from(content.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm))
    .map((match) => match[1]?.trim())
    .filter((heading): heading is string => Boolean(heading));
}

function normalizeHeading(value: string): string {
  return value.replace(/^#+\s*/, "").trim().toLowerCase();
}

function extractPlaceholders(content: string): Set<string> {
  const placeholders = new Set<string>();
  for (const match of content.matchAll(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g)) {
    if (match[1]) placeholders.add(match[1]);
  }
  return placeholders;
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (strings.length !== value.length || strings.some((item) => item.length === 0)) {
    return null;
  }
  return strings;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
