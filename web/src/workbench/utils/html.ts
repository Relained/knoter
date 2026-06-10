import type { HtmlWindowTheme } from "../../core/api/types";
import { getGlobalSettingsSnapshot } from "../../core/settings/preferences";
import { getActiveBase16Theme } from "../../shared/theming/runtime";
import type { SourceRecord } from "../types";

export function sourceToHtml(source: SourceRecord) {
  const files =
    source.fileNames.length > 0
      ? source.fileNames
          .map((fileName) => `<li>${escapeHtml(fileName)}</li>`)
          .join("")
      : "<li>No files attached</li>";

  return `
    <article>
      <p class="eyebrow">SOURCE</p>
      <h1>${escapeHtml(source.title)}</h1>
      <p>${escapeHtml(source.status)}</p>
      <section>
        <h2>Policy</h2>
        <dl>
          <dt>media_type</dt><dd>${escapeHtml(source.mediaType)}</dd>
          <dt>privacy</dt><dd>${escapeHtml(source.privacy)}</dd>
          <dt>time_scope</dt><dd>${escapeHtml(source.timeScope)}</dd>
          <dt>wiki_policy</dt><dd>${escapeHtml(source.wikiPolicy)}</dd>
        </dl>
      </section>
      <section>
        <h2>Files</h2>
        <ul>${files}</ul>
      </section>
    </article>
  `;
}

/**
 * Theme snapshot for sandboxed and external HTML documents, resolved from
 * the active base16 scheme and font settings at document-build time. Also
 * the payload shape for the html:openWindow IPC theme field.
 */
export function getSandboxTheme(): HtmlWindowTheme {
  const scheme = getActiveBase16Theme();
  const settings = getGlobalSettingsSnapshot();
  return {
    mode: scheme.mode,
    background: scheme.base01,
    surface: scheme.base03,
    border: scheme.base07,
    textPrimary: scheme.base0B,
    textSecondary: scheme.base0A,
    textMuted: scheme.base09,
    accent: scheme.base0C,
    fontFamily: settings.fontStacks[settings.uiFontFamily],
  };
}

export function createSandboxDocument(
  html: string,
  options: { compact?: boolean } = {},
) {
  const theme = getSandboxTheme();
  const metrics = options.compact
    ? { bodyPadding: "14px", bodyFontSize: "13px", h1Size: "18px", h2Margin: "16px", prePadding: "10px" }
    : { bodyPadding: "34px", bodyFontSize: "16px", h1Size: "32px", h2Margin: "28px", prePadding: "18px" };
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: ${theme.mode}; font-family: ${theme.fontFamily}; }
      body { margin: 0; padding: ${metrics.bodyPadding}; color: ${theme.textPrimary}; background: ${theme.background}; line-height: 1.55; font-size: ${metrics.bodyFontSize}; }
      article { max-width: 920px; margin: 0 auto; }
      h1 { margin: 0 0 16px; font-size: ${metrics.h1Size}; line-height: 1.1; }
      h2 { margin-top: ${metrics.h2Margin}; }
      p { color: ${theme.textSecondary}; }
      pre { overflow: auto; padding: ${metrics.prePadding}; border: 1px solid ${theme.border}; border-radius: 8px; background: ${theme.surface}; }
      .eyebrow { color: ${theme.accent}; font-size: 12px; font-weight: 800; text-transform: uppercase; }
      dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; }
      dt { color: ${theme.textMuted}; }
      dd { margin: 0; }
    </style>
  </head>
  <body>${sanitizeArtifactHtml(html)}</body>
</html>`;
}

function sanitizeArtifactHtml(html: string) {
  if (typeof window === "undefined" || !("DOMParser" in window))
    return escapeHtml(html);
  const parsed = new DOMParser().parseFromString(
    toDisplayHtml(html),
    "text/html",
  );
  parsed
    .querySelectorAll("script, iframe, object, embed, link, meta")
    .forEach((node) => node.remove());
  parsed.querySelectorAll<HTMLElement>("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on")) element.removeAttribute(attribute.name);
      if (
        (name === "src" || name === "href") &&
        /^(https?:|data:|javascript:)/.test(value)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  return parsed.body.innerHTML;
}

function toDisplayHtml(content: string) {
  const trimmed = content.trim();
  if (
    /^<!doctype html/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed) ||
    /<\/?[a-z][\s\S]*>/i.test(trimmed)
  )
    return trimmed;
  return `<pre>${escapeHtml(trimmed)}</pre>`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
