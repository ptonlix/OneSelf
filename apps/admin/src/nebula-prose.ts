export type ProseInline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "strong"; readonly text: string }
  | { readonly kind: "em"; readonly text: string }
  | { readonly kind: "del"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "link"; readonly key: string; readonly label: string }
  | { readonly kind: "url"; readonly href: string; readonly label: string }
  | { readonly kind: "image"; readonly src: string; readonly alt: string };

type ProseListItem = {
  readonly inlines: readonly ProseInline[];
  readonly nested: readonly ProseBlock[];
};

export type ProseAlign = "left" | "center" | "right";

export type ProseBlock =
  | {
      readonly kind: "heading";
      readonly level: 1 | 2 | 3 | 4;
      readonly inlines: readonly ProseInline[];
    }
  | { readonly kind: "paragraph"; readonly inlines: readonly ProseInline[] }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly items: readonly ProseListItem[];
    }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "quote"; readonly blocks: readonly ProseBlock[] }
  | {
      readonly kind: "table";
      readonly headers: readonly (readonly ProseInline[])[];
      readonly aligns: readonly ProseAlign[];
      readonly rows: readonly (readonly (readonly ProseInline[])[])[];
    }
  | { readonly kind: "rule" };

/** Drops YAML frontmatter so the drawer reads the page, not its metadata fence. */
export function pageBody(markdown: string): string {
  const text = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!text.startsWith("---")) return text.trim();
  const end = text.indexOf("\n---", 3);
  if (end === -1) return text.trim();
  return text
    .slice(end + 4)
    .replace(/^\n/, "")
    .trim();
}

export function proseBlocks(markdown: string): ProseBlock[] {
  return parseBlocks(pageBody(markdown), 0);
}

function parseBlocks(text: string, depth: number): ProseBlock[] {
  if (depth > 6 || text.trim() === "") return [];
  const lines = text.split("\n");
  const blocks: ProseBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const fence = fenceBlock(lines, index);
    if (fence !== null) {
      blocks.push(fence.block);
      index = fence.next;
      continue;
    }
    const heading = headingBlock(line);
    if (heading !== null) {
      blocks.push(heading);
      index += 1;
      continue;
    }
    if (isQuote(line)) {
      const quote = quoteBlock(lines, index, depth);
      blocks.push(quote.block);
      index = quote.next;
      continue;
    }
    const table = tableBlock(lines, index);
    if (table !== null) {
      blocks.push(table.block);
      index = table.next;
      continue;
    }
    if (isRule(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }
    const marker = listMarker(line);
    if (marker !== null) {
      const list = listBlock(lines, index, marker.ordered, marker.indent);
      blocks.push(list.block);
      index = list.next;
      continue;
    }
    const paragraph = paragraphBlock(lines, index);
    blocks.push(paragraph.block);
    index = paragraph.next;
  }
  return blocks;
}

function fenceBlock(
  lines: readonly string[],
  index: number,
): { block: ProseBlock; next: number } | null {
  const line = lines[index] ?? "";
  if (!/^ {0,3}```/.test(line)) return null;
  const code: string[] = [];
  let cursor = index + 1;
  while (cursor < lines.length && !/^ {0,3}```/.test(lines[cursor] ?? "")) {
    code.push(lines[cursor] ?? "");
    cursor += 1;
  }
  return { block: { kind: "code", text: code.join("\n") }, next: cursor + 1 };
}

function headingBlock(line: string): ProseBlock | null {
  const match = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const level = Math.min(match[1].length, 4) as 1 | 2 | 3 | 4;
  return { kind: "heading", level, inlines: inlines(match[2]) };
}

function quoteBlock(
  lines: readonly string[],
  index: number,
  depth: number,
): { block: ProseBlock; next: number } {
  const inner: string[] = [];
  let cursor = index;
  while (cursor < lines.length && isQuote(lines[cursor] ?? "")) {
    inner.push((lines[cursor] ?? "").replace(/^ {0,3}> ?/, ""));
    cursor += 1;
  }
  return {
    block: { kind: "quote", blocks: parseBlocks(inner.join("\n"), depth + 1) },
    next: cursor,
  };
}

function tableBlock(
  lines: readonly string[],
  index: number,
): { block: ProseBlock; next: number } | null {
  const headerLine = lines[index] ?? "";
  const separator = lines[index + 1] ?? "";
  if (!isTableRow(headerLine) || !isSeparator(separator)) return null;
  const headers = splitCells(headerLine).map((cell) => inlines(cell));
  const aligns = splitCells(separator).map(alignOf);
  const rows: ProseInline[][][] = [];
  let cursor = index + 2;
  while (cursor < lines.length) {
    const line = lines[cursor] ?? "";
    if (line.trim() === "" || !isTableRow(line) || isSeparator(line)) break;
    const cells = splitCells(line).map((cell) => inlines(cell));
    while (cells.length < headers.length) cells.push([]);
    rows.push(cells);
    cursor += 1;
  }
  return { block: { kind: "table", headers, aligns, rows }, next: cursor };
}

function listBlock(
  lines: readonly string[],
  index: number,
  ordered: boolean,
  indent: number,
): { block: ProseBlock; next: number } {
  const items: ProseListItem[] = [];
  let cursor = index;
  while (cursor < lines.length) {
    const marker = listMarker(lines[cursor] ?? "", true);
    if (marker === null || marker.indent !== indent || marker.ordered !== ordered) break;
    const parts = [marker.text];
    cursor += 1;
    while (cursor < lines.length) {
      const line = lines[cursor] ?? "";
      if (listMarker(line, true) !== null || line.trim() === "" || !/^ {2,}\S/.test(line)) break;
      parts.push(line.trim());
      cursor += 1;
    }
    const nested: ProseBlock[] = [];
    while (cursor < lines.length) {
      const next = listMarker(lines[cursor] ?? "", true);
      if (next === null || next.indent <= indent) break;
      const child = listBlock(lines, cursor, next.ordered, next.indent);
      if (child.next === cursor) break;
      nested.push(child.block);
      cursor = child.next;
    }
    items.push({ inlines: itemInlines(parts.join(" ")), nested });
  }
  return { block: { kind: "list", ordered, items }, next: cursor };
}

function paragraphBlock(
  lines: readonly string[],
  index: number,
): { block: ProseBlock; next: number } {
  const paragraph: string[] = [];
  let cursor = index;
  while (cursor < lines.length && !startsBlock(lines, cursor)) {
    paragraph.push((lines[cursor] ?? "").trim());
    cursor += 1;
  }
  return { block: { kind: "paragraph", inlines: inlines(paragraph.join(" ")) }, next: cursor };
}

function startsBlock(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (line.trim() === "") return true;
  return startsOwnBlock(line, lines[index + 1] ?? "");
}

function startsOwnBlock(line: string, next: string): boolean {
  return (
    /^ {0,3}```/.test(line) ||
    headingBlock(line) !== null ||
    isQuote(line) ||
    isRule(line) ||
    listMarker(line) !== null ||
    (isTableRow(line) && isSeparator(next))
  );
}

function isQuote(line: string): boolean {
  return /^ {0,3}>(?!=)/.test(line);
}

function isRule(line: string): boolean {
  return /^ {0,3}(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})[ \t]*$/.test(line);
}

function isTableRow(line: string): boolean {
  return line.includes("|") && splitCells(line).length >= 2;
}

function isSeparator(line: string): boolean {
  const cells = splitCells(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitCells(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  if (!text.includes("|") && !line.includes("|")) return [];
  return text.split("|").map((cell) => cell.trim());
}

function alignOf(cell: string): ProseAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
}

function listMarker(
  line: string,
  nested = false,
): { indent: number; ordered: boolean; text: string } | null {
  if (isRule(line)) return null;
  const match = /^( *)(?:([-*+])|(\d{1,9}[.)]))[ \t]+(.*)$/.exec(line);
  if (match?.[4] === undefined) return null;
  const indent = match[1]?.length ?? 0;
  if (!nested && indent > 3) return null;
  return { indent, ordered: match[3] !== undefined, text: match[4] };
}

function itemInlines(text: string): ProseInline[] {
  const task = /^\[([ xX])\][ \t]+(.*)$/.exec(text);
  if (task?.[1] === undefined || task[2] === undefined) return inlines(text);
  return [{ kind: "text", text: task[1] === " " ? "☐ " : "☑ " }, ...inlines(task[2])];
}

function inlines(text: string): ProseInline[] {
  // One balanced (...) stays in the image URL so javascript:alert(1) is rejected whole.
  const pattern =
    /!\[([^\]]*)\]\(([^()\s]+(?:\([^()\s]*\)[^()\s]*)?)\)|\[\[([^\]|\n]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|~~([^~]+)~~|`([^`]+)`|\*([^*\n]+)\*/g;
  const parts: ProseInline[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > cursor) parts.push({ kind: "text", text: text.slice(cursor, start) });
    const inline = inlineFrom(match);
    if (inline !== null) parts.push(inline);
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push({ kind: "text", text: text.slice(cursor) });
  return parts;
}

function inlineFrom(match: RegExpMatchArray): ProseInline | null {
  if (match[1] !== undefined && match[2] !== undefined) {
    const src = safeImageSrc(match[2]);
    if (src !== null) return { kind: "image", src, alt: match[1] };
    return { kind: "text", text: match[1] === "" ? "图片" : match[1] };
  }
  if (match[3] !== undefined) {
    return { kind: "link", key: match[3].trim(), label: (match[4] ?? match[3]).trim() };
  }
  if (match[5] !== undefined && match[6] !== undefined) {
    const href = safeHref(match[6]);
    return href === null
      ? { kind: "text", text: match[5] }
      : { kind: "url", href, label: match[5] };
  }
  if (match[7] !== undefined) return { kind: "strong", text: match[7] };
  if (match[8] !== undefined) return { kind: "del", text: match[8] };
  if (match[9] !== undefined) return { kind: "code", text: match[9] };
  if (match[10] !== undefined) return { kind: "em", text: match[10] };
  return null;
}

/** Pictures leave the drawer only for http(s) or a same-origin path. mailto is not a picture. */
function safeImageSrc(value: string): string | null {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return null;
}

/** Only ordinary web addresses leave the drawer. Wiki links stay an in-app selection. */
function safeHref(value: string): string | null {
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return null;
}
