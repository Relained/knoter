import { builtInBase16Schemes, defaultBase16Scheme, elementColorAliases } from "./base16";

export type Base16Mode = "dark" | "light";

export type Base16Scheme = {
  id: string;
  name: string;
  mode: Base16Mode;
  base00: string;
  base01: string;
  base02: string;
  base03: string;
  base04: string;
  base05: string;
  base06: string;
  base07: string;
  base08: string;
  base09: string;
  base0A: string;
  base0B: string;
  base0C: string;
  base0D: string;
  base0E: string;
  base0F: string;
};

type Base16ColorKey = Exclude<keyof Base16Scheme, "id" | "name" | "mode">;
type Base16ExternalSource = Record<string, unknown>;

export type ElementColorAlias =
  | { base: Base16ColorKey; alpha?: number; shadow?: string; value?: never }
  | { value: string; base?: never; alpha?: never; shadow?: never };

export type ThemeVariables = Record<string, string>;

export type Base16ValidationIssue = {
  field: string;
  message: string;
};

export type Base16ImportResult =
  | { ok: true; scheme: Base16Scheme; variables: ThemeVariables }
  | { ok: false; issues: Base16ValidationIssue[] };

export type ThemeHarness = {
  applyBase16Theme: typeof applyBase16Theme;
  builtInBase16Schemes: Base16Scheme[];
  cycleBase16Theme: typeof cycleBase16Theme;
  defaultBase16Scheme: Base16Scheme;
  elementColorAliases: Record<string, ElementColorAlias>;
  getActiveBase16Theme: typeof getActiveBase16Theme;
  getBuiltInBase16Themes: typeof getBuiltInBase16Themes;
  importBase16Theme: typeof importBase16Theme;
  loadBase16Theme: typeof loadBase16Theme;
  normalizeBase16Scheme: typeof normalizeBase16Scheme;
  validateBase16Theme: typeof validateBase16Theme;
  resolveThemeVariables: typeof resolveThemeVariables;
};

const cssVariablePrefix = "--theme-";
const themeStorageKey = "knoter.appearance.base16.v1";
const base16Keys = Object.keys(defaultBase16Scheme).filter((key) => /^base[0-9A-F]{2}$/.test(key)) as Base16ColorKey[];
let activeScheme: Base16Scheme = defaultBase16Scheme;

export function resolveThemeVariables(
  scheme: Base16Scheme = defaultBase16Scheme,
  aliases: Record<string, ElementColorAlias> = elementColorAliases
): ThemeVariables {
  const variables: ThemeVariables = {
    "--theme-color-scheme": scheme.mode === "light" ? "light" : "dark"
  };

  for (const key of base16Keys) {
    variables[`--${key}`] = scheme[key] ?? defaultBase16Scheme[key];
  }

  for (const [elementId, alias] of Object.entries(aliases)) {
    variables[`${cssVariablePrefix}${toCssVariableName(elementId)}`] = resolveAliasValue(alias, scheme);
  }

  return variables;
}

export function applyThemeVariables(variables: ThemeVariables, root: HTMLElement = document.documentElement) {
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
}

export function applyBase16Theme(
  scheme: Partial<Base16Scheme> = defaultBase16Scheme,
  aliases: Record<string, ElementColorAlias> = elementColorAliases
) {
  const normalizedScheme = normalizeBase16Scheme(scheme);
  const variables = resolveThemeVariables(normalizedScheme, aliases);
  const root = document.documentElement;

  activeScheme = normalizedScheme;
  root.dataset.theme = normalizedScheme.id;
  root.dataset.themeMode = normalizedScheme.mode;
  root.style.colorScheme = normalizedScheme.mode;
  applyThemeVariables(variables, root);
  return variables;
}

export function loadBase16Theme(scheme: Partial<Base16Scheme>, options: { persist?: boolean } = {}) {
  const normalizedScheme = normalizeBase16Scheme(scheme);
  const variables = applyBase16Theme(normalizedScheme);

  if (options.persist) saveStoredThemeScheme(normalizedScheme);
  window.dispatchEvent(new CustomEvent("knoter:themechange", { detail: { scheme: normalizedScheme, variables } }));
  return variables;
}

export function importBase16Theme(source: unknown, options: { persist?: boolean } = {}): Base16ImportResult {
  const validation = validateBase16Theme(source);
  if (!validation.ok) return validation;

  const variables = loadBase16Theme(validation.scheme, options);
  return { ok: true, scheme: validation.scheme, variables };
}

export function cycleBase16Theme(options: { persist?: boolean } = {}) {
  const currentIndex = builtInBase16Schemes.findIndex((scheme) => scheme.id === activeScheme.id);
  const nextScheme = builtInBase16Schemes[(currentIndex + 1 + builtInBase16Schemes.length) % builtInBase16Schemes.length];
  return loadBase16Theme(nextScheme, { persist: options.persist ?? true });
}

export function getActiveBase16Theme() {
  return activeScheme;
}

export function getBuiltInBase16Themes() {
  return builtInBase16Schemes;
}

export function installThemeHarness() {
  const initialScheme = readStoredThemeScheme() ?? defaultBase16Scheme;
  applyBase16Theme(initialScheme);

  window.knoterTheme = {
    applyBase16Theme,
    builtInBase16Schemes,
    cycleBase16Theme,
    defaultBase16Scheme,
    elementColorAliases,
    getActiveBase16Theme,
    getBuiltInBase16Themes,
    importBase16Theme,
    loadBase16Theme,
    normalizeBase16Scheme,
    validateBase16Theme,
    resolveThemeVariables
  };
}

export function validateBase16Theme(source: unknown): { ok: true; scheme: Base16Scheme } | { ok: false; issues: Base16ValidationIssue[] } {
  const parsed = parseExternalBase16Source(source);
  if (!parsed.ok) return parsed;

  const issues: Base16ValidationIssue[] = [];
  const input = parsed.value;
  const colors = {} as Record<Base16ColorKey, string>;

  for (const key of base16Keys) {
    const color = normalizeExternalHexColor(input[key]);
    if (!color) {
      issues.push({
        field: key,
        message: "Expected a 3 or 6 digit hex color, with or without a leading #."
      });
    } else {
      colors[key] = color;
    }
  }

  const id = getOptionalText(input.id) ?? slugifyThemeId(getOptionalText(input.slug) ?? getOptionalText(input.name) ?? getOptionalText(input.scheme));
  const name = getOptionalText(input.name) ?? getOptionalText(input.scheme) ?? id;
  const mode = input.mode === "light" ? "light" : "dark";

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    scheme: {
      id,
      name,
      mode,
      ...colors
    }
  };
}

export function normalizeBase16Scheme(scheme: Partial<Base16Scheme> = defaultBase16Scheme): Base16Scheme {
  const source = scheme && typeof scheme === "object" ? scheme : {};
  const normalized = {
    id: typeof source.id === "string" && source.id.trim() ? source.id : defaultBase16Scheme.id,
    name: typeof source.name === "string" && source.name.trim() ? source.name : defaultBase16Scheme.name,
    mode: source.mode === "light" ? "light" : "dark"
  } as Base16Scheme;

  for (const key of base16Keys) {
    const color = source[key];
    (normalized as Record<Base16ColorKey, string>)[key] = isHexColor(color) ? color : defaultBase16Scheme[key]!;
  }

  return normalized;
}

function resolveAliasValue(alias: ElementColorAlias, scheme: Base16Scheme): string {
  if ("value" in alias) return alias.value ?? "";
  const color = scheme[alias.base] ?? defaultBase16Scheme[alias.base]!;
  if (alias.shadow) return `${alias.shadow} ${hexToRgbSlashAlpha(color, alias.alpha ?? 1)}`;
  if (typeof alias.alpha === "number") return hexToRgbSlashAlpha(color, alias.alpha);
  return color;
}

function hexToRgbSlashAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized;
  const number = Number.parseInt(value, 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;

  return `rgb(${red} ${green} ${blue} / ${alpha})`;
}

function toCssVariableName(elementId: string) {
  return elementId.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/\./g, "-").toLowerCase();
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function parseExternalBase16Source(source: unknown): { ok: true; value: Base16ExternalSource } | { ok: false; issues: Base16ValidationIssue[] } {
  if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source) as unknown;
      return parseExternalBase16Source(parsed);
    } catch {
      return { ok: false, issues: [{ field: "source", message: "Expected valid JSON." }] };
    }
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { ok: false, issues: [{ field: "source", message: "Expected a Base16 theme object." }] };
  }

  return { ok: true, value: source as Base16ExternalSource };
}

function normalizeExternalHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim();
  const match = color.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  return match ? `#${match[1]}` : null;
}

function getOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function slugifyThemeId(value: string | null): string {
  const slug = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `external-${slug}` : "external-base16";
}

function readStoredThemeScheme(): Base16Scheme | null {
  try {
    const raw = localStorage.getItem(themeStorageKey);
    return raw ? normalizeBase16Scheme(JSON.parse(raw)) : null;
  } catch (error) {
    console.warn("Failed to read stored theme scheme.", error);
    return null;
  }
}

function saveStoredThemeScheme(scheme: Base16Scheme) {
  try {
    localStorage.setItem(themeStorageKey, JSON.stringify(scheme));
  } catch (error) {
    console.warn("Failed to save theme scheme.", error);
  }
}
