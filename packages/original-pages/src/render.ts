import type { PublicPage } from "@oneself/public-client";

export type DisplayFile = {
  readonly id: string;
  readonly mediaType: string;
  readonly href: string;
};

export type DisplayPage = {
  readonly page: PublicPage;
  readonly files: readonly DisplayFile[];
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function renderOriginalPage(pages: readonly DisplayPage[]): string {
  if (pages.length === 0) {
    return renderStatus("empty", "没有公开页");
  }
  return pages.map((entry) => renderPage(entry)).join("");
}

export function renderStatus(state: "empty" | "error", text: string): string {
  return `<p data-state="${state}">${escapeText(text)}</p>`;
}

export function markdownBody(markdown: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown);
  if (match === null) {
    return markdown;
  }
  return markdown.slice(match[0].length).replace(/^\r?\n/, "");
}

export function fileIds(frontmatter: Readonly<Record<string, unknown>>): readonly string[] {
  const value = frontmatter.files;
  if (!Array.isArray(value)) {
    return [];
  }
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0 && !item.includes("/")) {
      ids.push(item);
    }
  }
  return ids;
}

function renderPage(entry: DisplayPage): string {
  const { page, files } = entry;
  const body = markdownBody(page.markdown);
  const fields =
    page.type === "profile"
      ? renderProfile(page)
      : page.type === "experience" || page.type === "education"
        ? renderExperience(page)
        : renderOther(page);
  return `<article data-type="${escapeText(page.type)}" data-source="${escapeText(page.source)}" data-slug="${escapeText(page.slug)}">${fields}${renderBody(body)}${renderFiles(files, page.title)}</article>`;
}

function renderProfile(page: PublicPage): string {
  const name = optionalString(page.frontmatter, "name");
  const nameHtml = name === null ? "" : `<h1 data-field="name">${escapeText(name)}</h1>`;
  return `${nameHtml}<p data-field="title">${escapeText(page.title)}</p>`;
}

function renderExperience(page: PublicPage): string {
  return `<h2 data-field="title">${escapeText(page.title)}</h2>${optionalField(page, "org")}${optionalField(page, "start")}${optionalField(page, "end")}`;
}

function renderOther(page: PublicPage): string {
  return `<h2 data-field="title">${escapeText(page.title)}</h2><p data-field="type">${escapeText(page.type)}</p>`;
}

function optionalField(page: PublicPage, key: "org" | "start" | "end"): string {
  const value = optionalString(page.frontmatter, key);
  if (value === null) {
    return "";
  }
  return `<p data-field="${key}">${escapeText(value)}</p>`;
}

function optionalString(
  frontmatter: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = frontmatter[key];
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value;
}

function renderBody(body: string): string {
  return `<div data-field="body">${escapeText(body)}</div>`;
}

function renderFiles(files: readonly DisplayFile[], title: string): string {
  const shown = files.filter(
    (file) => IMAGE_TYPES.has(file.mediaType) || file.mediaType === "application/pdf",
  );
  if (shown.length === 0) {
    return "";
  }
  const items = shown
    .map((file) => {
      if (file.mediaType === "application/pdf") {
        return `<a data-file="${escapeText(file.id)}" data-media-type="application/pdf" href="${escapeText(file.href)}">${escapeText(file.id)}</a>`;
      }
      return `<img data-file="${escapeText(file.id)}" data-media-type="${escapeText(file.mediaType)}" alt="${escapeText(title)}" src="${escapeText(file.href)}" />`;
    })
    .join("");
  return `<div data-field="files">${items}</div>`;
}

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
