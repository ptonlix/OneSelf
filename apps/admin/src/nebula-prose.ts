export type ProseInline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "strong"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "link"; readonly key: string; readonly label: string };

export type ProseBlock =
  | { readonly kind: "heading"; readonly level: 2 | 3; readonly inlines: readonly ProseInline[] }
  | { readonly kind: "paragraph"; readonly inlines: readonly ProseInline[] }
  | { readonly kind: "list"; readonly items: readonly (readonly ProseInline[])[] }
  | { readonly kind: "code"; readonly text: string };

/** Drops YAML frontmatter so the drawer reads the page, not its metadata fence. */
export function pageBody(markdown: string): string {
  const text = markdown.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return text.trim();
  const end = text.indexOf("\n---", 3);
  if (end === -1) return text.trim();
  return text
    .slice(end + 4)
    .replace(/^\n/, "")
    .trim();
}

export function proseBlocks(markdown: string): ProseBlock[] {
  const body = pageBody(markdown);
  if (body === "") return [];
  const blocks: ProseBlock[] = [];
  const lines = body.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push({ kind: "heading", level: 3, inlines: inlines(line.slice(4)) });
      index += 1;
      continue;
    }
    if (line.startsWith("## ") || line.startsWith("# ")) {
      const level = line.startsWith("## ") ? 3 : 2;
      blocks.push({ kind: "heading", level, inlines: inlines(line.replace(/^#{1,2} /, "")) });
      index += 1;
      continue;
    }
    if (isList(line)) {
      const items: ProseInline[][] = [];
      while (index < lines.length && isList(lines[index] ?? "")) {
        items.push(inlines((lines[index] ?? "").replace(/^[-*] /, "")));
        index += 1;
      }
      blocks.push({ kind: "list", items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() !== "" &&
      !isBlock(lines[index] ?? "")
    ) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", inlines: inlines(paragraph.join(" ")) });
  }
  return blocks;
}

function isList(line: string): boolean {
  return line.startsWith("- ") || line.startsWith("* ");
}

function isBlock(line: string): boolean {
  return line.startsWith("#") || line.startsWith("```") || isList(line);
}

function inlines(text: string): ProseInline[] {
  const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\*\*([^*]+)\*\*|`([^`]+)`/g;
  const parts: ProseInline[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > cursor) parts.push({ kind: "text", text: text.slice(cursor, start) });
    if (match[1] !== undefined) {
      parts.push({ kind: "link", key: match[1].trim(), label: (match[2] ?? match[1]).trim() });
    } else if (match[3] !== undefined) {
      parts.push({ kind: "strong", text: match[3] });
    } else if (match[4] !== undefined) {
      parts.push({ kind: "code", text: match[4] });
    }
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push({ kind: "text", text: text.slice(cursor) });
  return parts;
}
