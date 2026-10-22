import { fail, ok, type DomainResult } from "./result.ts";

type FrontmatterScalar = string | number | boolean | null;

export type FrontmatterValue = FrontmatterScalar | readonly FrontmatterScalar[];

export type Frontmatter = Readonly<Record<string, FrontmatterValue>>;

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function splitFrontmatter(markdown: string): { yaml: string; body: string } | null {
  if (!markdown.startsWith("---\n") && !markdown.startsWith("---\r\n")) {
    return null;
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (match?.index !== 0) {
    return null;
  }
  const yaml = match[1] ?? "";
  return { yaml, body: markdown.slice(match[0].length) };
}

export function parseFrontmatterBlock(yaml: string): DomainResult<Frontmatter> {
  const lines = yaml.split(/\r?\n/);
  const result: Record<string, FrontmatterValue> = {};
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      if (line.startsWith(" ") || line.startsWith("\t")) {
        return fail("invalid", "frontmatter is indented");
      }
      index += 1;
      continue;
    }
    if (line.startsWith(" ") || line.startsWith("\t")) {
      return fail("invalid", "frontmatter is indented");
    }
    const keyLine = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (!keyLine) {
      return fail("invalid", "frontmatter line is not a key");
    }
    const key = keyLine[1] ?? "";
    const rest = keyLine[2] ?? "";
    if (!KEY_PATTERN.test(key) || RESERVED_KEYS.has(key)) {
      return fail("invalid", "frontmatter key is not allowed");
    }
    if (Object.hasOwn(result, key)) {
      return fail("invalid", "frontmatter key is duplicated");
    }
    if (rest.trim() === "") {
      const block = parseBlockValue(lines, index + 1);
      if (!block.ok) {
        return block;
      }
      result[key] = block.value.value;
      index = block.value.nextIndex;
      continue;
    }
    if (!/^\s/.test(rest)) {
      return fail("invalid", "frontmatter key is missing a space before the value");
    }
    const scalar = parseFlow(rest.trim());
    if (!scalar.ok) {
      return scalar;
    }
    result[key] = scalar.value;
    index += 1;
  }
  return ok(result);
}

function parseBlockValue(
  lines: readonly string[],
  start: number,
): DomainResult<{ value: FrontmatterValue; nextIndex: number }> {
  let next = start;
  while (next < lines.length && (lines[next] ?? "").trim() === "") {
    next += 1;
  }
  const candidate = lines[next] ?? "";
  if (!candidate.startsWith("  - ") && candidate !== "  -") {
    return ok({ value: null, nextIndex: start });
  }
  const items: FrontmatterScalar[] = [];
  while (next < lines.length) {
    const line = lines[next] ?? "";
    if (line.trim() === "") {
      next += 1;
      continue;
    }
    if (!line.startsWith("  -")) {
      break;
    }
    const raw = line.slice("  -".length).trim();
    if (raw === "") {
      return fail("invalid", "frontmatter list item is empty");
    }
    const scalar = parseScalar(raw);
    if (!scalar.ok) {
      return scalar;
    }
    if (!isListScalar(scalar.value)) {
      return fail("invalid", "frontmatter list item must be a scalar");
    }
    items.push(scalar.value);
    next += 1;
  }
  return ok({ value: items, nextIndex: next });
}

function parseFlow(input: string): DomainResult<FrontmatterValue> {
  if (input.startsWith("[")) {
    return parseInlineArray(input);
  }
  return parseScalar(input);
}

function parseInlineArray(input: string): DomainResult<readonly FrontmatterScalar[]> {
  if (!input.endsWith("]")) {
    return fail("invalid", "frontmatter array is not closed");
  }
  const inner = input.slice(1, -1).trim();
  if (inner === "") {
    return ok([]);
  }
  const parts = splitCommas(inner);
  const items: FrontmatterScalar[] = [];
  for (const part of parts) {
    const token = part.trim();
    if (token === "") {
      return fail("invalid", "frontmatter array item is empty");
    }
    const scalar = parseScalar(token);
    if (!scalar.ok) {
      return scalar;
    }
    if (!isListScalar(scalar.value)) {
      return fail("invalid", "frontmatter array item must be a scalar");
    }
    items.push(scalar.value);
  }
  return ok(items);
}

function isListScalar(value: FrontmatterValue): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function parseScalar(input: string): DomainResult<FrontmatterValue> {
  if (input.startsWith("[") || input.startsWith("{")) {
    return fail("invalid", "nested frontmatter values are not supported");
  }
  if (input.startsWith('"') || input.startsWith("'")) {
    return parseQuoted(input);
  }
  if (input === "true") {
    return ok(true);
  }
  if (input === "false") {
    return ok(false);
  }
  if (input === "null" || input === "~") {
    return ok(null);
  }
  if (NUMBER_PATTERN.test(input)) {
    return ok(Number(input));
  }
  if (input.includes(": ") || input.startsWith("- ")) {
    return fail("invalid", "frontmatter value is not a scalar");
  }
  return ok(input);
}

function parseQuoted(input: string): DomainResult<string> {
  const quote = input[0];
  if ((quote !== '"' && quote !== "'") || input.length < 2 || !input.endsWith(quote)) {
    return fail("invalid", "frontmatter string is not closed");
  }
  const inner = input.slice(1, -1);
  if (quote === "'") {
    if (inner.includes("'") && !inner.includes("''")) {
      return fail("invalid", "frontmatter string is not closed");
    }
    return ok(inner.replaceAll("''", "'"));
  }
  let decoded = "";
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char === undefined) {
      break;
    }
    if (char !== "\\") {
      decoded += char;
      continue;
    }
    const escaped = inner[index + 1];
    if (escaped === "n") {
      decoded += "\n";
    } else if (escaped === '"' || escaped === "\\") {
      decoded += escaped;
    } else {
      return fail("invalid", "frontmatter string has an unknown escape");
    }
    index += 1;
  }
  return ok(decoded);
}

function splitCommas(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (const char of input) {
    if (quote !== null) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ",") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}
