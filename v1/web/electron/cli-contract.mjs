const validExplorerLayers = new Set(["source", "artifact", "template"]);
const validSearchModes = new Set(["keyword", "semantic", "hybrid"]);
const validSearchScopes = new Set(["llm-wiki", "artifacts", "sources", "all"]);

export function validateNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

export function validateOptionalString(value, label) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value.trim();
}

export function validateExplorerLayers(value, options = {}) {
  const fallback = options.fallback ?? ["artifact"];
  if (!Array.isArray(value)) return fallback;
  if (value.length === 0 && options.allowEmpty) return [];
  const layers = value.filter((layer) => validExplorerLayers.has(layer));
  if (layers.length === 0) throw new Error("At least one valid layer is required");
  return layers;
}

export function validateSearchMode(value) {
  if (typeof value === "string" && validSearchModes.has(value)) return value;
  return "hybrid";
}

export function validateSearchScope(value) {
  if (typeof value === "string" && validSearchScopes.has(value)) return value;
  return "llm-wiki";
}

export function buildSearchCliArgs(input) {
  const query = validateNonEmptyString(input?.query, "Search query");
  const mode = validateSearchMode(input?.mode);
  const scope = validateSearchScope(input?.scope);
  const args = ["search", query, "--mode", mode, "--top", "20", "--scope", scope];
  return { args, scope };
}

export function validateNoteFileName(value) {
  const fileName = validateNonEmptyString(value, "Note file name");
  if (fileName.length > 120) throw new Error("Note file name is too long");
  if (/[\\/]/.test(fileName) || fileName.includes("..") || fileName.startsWith(".")) {
    throw new Error("Note file name must be a plain file name");
  }
  return fileName.toLowerCase().endsWith(".md") ? fileName : `${fileName}.md`;
}

export function validateVaultName(value) {
  const name = validateNonEmptyString(value, "Vault name");
  if (name.length > 64) throw new Error("Vault name is too long");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new Error("Vault name may use letters, digits, dot, dash, and underscore");
  }
  return name;
}

export function validateTemplateName(value) {
  const name = validateNonEmptyString(value, "Template name");
  if (name.length > 64) throw new Error("Template name is too long");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error("Template name may use lowercase letters, digits, and dashes");
  }
  return name;
}

export function toSearchResult(result) {
  const path = result.filePath ?? "";
  return {
    id: String(result.id),
    title: (result.title ?? path) || "Untitled",
    path,
    layer: "artifact",
    score: typeof result.score === "number" ? result.score : 0,
    snippet: result.content ?? result.heading ?? ""
  };
}
