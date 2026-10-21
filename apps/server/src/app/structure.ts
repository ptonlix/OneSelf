import {
  fail,
  ok,
  projectMarkdown,
  type DomainResult,
  type Fact,
  type PageRecord,
  type TimelineEntry,
} from "@oneself/domain";

type FrontmatterValue = PageRecord["frontmatter"][string];

export function addTag(markdown: string, tag: string): DomainResult<string | null> {
  const projected = projectMarkdown(markdown);
  if (!projected.ok) {
    return projected;
  }
  if (projected.value.tags.includes(tag)) {
    return ok(null);
  }
  const frontmatter = {
    ...projected.value.frontmatter,
    tags: [...projected.value.tags, tag],
  };
  return ok(joinMarkdown(serializeFrontmatter(frontmatter), projected.value.body));
}

export function removeTag(markdown: string, tag: string): DomainResult<string | null> {
  const projected = projectMarkdown(markdown);
  if (!projected.ok) {
    return projected;
  }
  if (!projected.value.tags.includes(tag)) {
    return fail("not_found", "tag not found");
  }
  const frontmatter = {
    ...projected.value.frontmatter,
    tags: projected.value.tags.filter((item) => item !== tag),
  };
  return ok(joinMarkdown(serializeFrontmatter(frontmatter), projected.value.body));
}

export function addLink(
  markdown: string,
  source: string,
  slug: string,
): DomainResult<string | null> {
  const token = `[[${source}/${slug}]]`;
  if (markdown.includes(token)) {
    return ok(null);
  }
  const projected = projectMarkdown(markdown);
  if (!projected.ok) {
    return projected;
  }
  const body = projected.value.body.replace(/\s*$/, "");
  const nextBody = `${body}\n\n${token}\n`;
  return ok(joinMarkdown(serializeFrontmatter(projected.value.frontmatter), nextBody));
}

export function removeLink(
  markdown: string,
  source: string,
  slug: string,
): DomainResult<string | null> {
  const token = `[[${source}/${slug}]]`;
  if (!markdown.includes(token)) {
    return fail("not_found", "link not found");
  }
  const projected = projectMarkdown(markdown);
  if (!projected.ok) {
    return projected;
  }
  const body = projected.value.body.split(token).join("");
  return ok(joinMarkdown(serializeFrontmatter(projected.value.frontmatter), body));
}

export function rememberFact(markdown: string, fact: Fact): DomainResult<string> {
  const projected = projectMarkdown(markdown);
  if (!projected.ok) {
    return projected;
  }
  if (projected.value.facts.some((item) => item.id === fact.id)) {
    return fail("conflict", "fact id already exists");
  }
  return rewriteFences(
    projected.value.frontmatter,
    projected.value.body,
    [...projected.value.facts, fact],
    projected.value.timeline,
  );
}

export function forgetFact(markdown: string, id: string): DomainResult<string> {
  const projected = projectMarkdown(markdown);
  if (!projected.ok) {
    return projected;
  }
  if (!projected.value.facts.some((item) => item.id === id)) {
    return fail("not_found", "fact not found");
  }
  return rewriteFences(
    projected.value.frontmatter,
    projected.value.body,
    projected.value.facts.filter((item) => item.id !== id),
    projected.value.timeline,
  );
}

export function addTimeline(markdown: string, entry: TimelineEntry): DomainResult<string> {
  const projected = projectMarkdown(markdown);
  if (!projected.ok) {
    return projected;
  }
  return rewriteFences(projected.value.frontmatter, projected.value.body, projected.value.facts, [
    ...projected.value.timeline,
    entry,
  ]);
}

function rewriteFences(
  frontmatter: PageRecord["frontmatter"],
  body: string,
  facts: readonly Fact[],
  timeline: readonly TimelineEntry[],
): DomainResult<string> {
  for (const fact of facts) {
    if (!fenceText(fact.statement)) {
      return fail("invalid", "fact statement cannot contain a delimiter");
    }
  }
  for (const entry of timeline) {
    if (!fenceText(entry.title)) {
      return fail("invalid", "timeline title cannot contain a delimiter");
    }
  }
  const prose = stripFences(body).replace(/\s*$/, "");
  const sections = [renderFacts(facts), renderTimeline(timeline)].filter(
    (section) => section !== "",
  );
  const nextBody = sections.length === 0 ? `${prose}\n` : `${prose}\n\n${sections.join("\n\n")}\n`;
  const markdown = joinMarkdown(serializeFrontmatter(frontmatter), nextBody);
  const roundTrip = projectMarkdown(markdown);
  if (!roundTrip.ok) {
    return fail("invalid", "fence did not round-trip");
  }
  if (
    !sameFacts(roundTrip.value.facts, facts) ||
    !sameTimeline(roundTrip.value.timeline, timeline)
  ) {
    return fail("invalid", "fence did not round-trip");
  }
  return ok(markdown);
}

function fenceText(value: string): boolean {
  return !value.includes("|") && !value.includes("\n") && !value.includes("\r");
}

function sameFacts(parsed: readonly Fact[], input: readonly Fact[]): boolean {
  if (parsed.length !== input.length) {
    return false;
  }
  return parsed.every((fact, index) => {
    const expected = input[index];
    return (
      expected !== undefined &&
      fact.id === expected.id &&
      fact.entity === expected.entity &&
      fact.statement === expected.statement &&
      fact.confidence === expected.confidence &&
      fact.validUntil === expected.validUntil
    );
  });
}

function sameTimeline(parsed: readonly TimelineEntry[], input: readonly TimelineEntry[]): boolean {
  if (parsed.length !== input.length) {
    return false;
  }
  return parsed.every((entry, index) => {
    const expected = input[index];
    return (
      expected !== undefined &&
      entry.occurredOn === expected.occurredOn &&
      entry.title === expected.title &&
      entry.detail === expected.detail
    );
  });
}

function renderFacts(facts: readonly Fact[]): string {
  if (facts.length === 0) {
    return "";
  }
  const items = facts.map((fact) => {
    const lines = [
      `- id: ${fact.id}`,
      `  entity: ${fact.entity}`,
      `  statement: ${fact.statement}`,
    ];
    if (fact.confidence !== null) {
      lines.push(`  confidence: ${String(fact.confidence)}`);
    }
    if (fact.validUntil !== null) {
      lines.push(`  valid_until: ${fact.validUntil}`);
    }
    return lines.join("\n");
  });
  return `## Facts\n\n${items.join("\n\n")}`;
}

function renderTimeline(entries: readonly TimelineEntry[]): string {
  if (entries.length === 0) {
    return "";
  }
  const lines = entries.map((entry) => {
    if (entry.detail === null) {
      return `- ${entry.occurredOn} | ${entry.title}`;
    }
    return `- ${entry.occurredOn} | ${entry.title} | ${entry.detail}`;
  });
  return `## Timeline\n\n${lines.join("\n")}`;
}

function stripFences(body: string): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of body.split("\n")) {
    if (line.trimEnd() === "## Facts" || line.trimEnd() === "## Timeline") {
      skipping = true;
      continue;
    }
    if (skipping && line.startsWith("## ")) {
      skipping = false;
    }
    if (!skipping) {
      kept.push(line);
    }
  }
  return kept.join("\n");
}

function serializeFrontmatter(frontmatter: PageRecord["frontmatter"]): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    lines.push(`${key}: ${formatValue(value)}`);
  }
  return lines.join("\n");
}

function formatValue(value: FrontmatterValue): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    return `[${value.map((item) => formatScalar(item)).join(", ")}]`;
  }
  return formatScalar(value);
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value !== "string") {
    return "null";
  }
  if (
    value.length > 0 &&
    !value.includes(": ") &&
    !value.startsWith("- ") &&
    !/^[\[\]{}'"]/.test(value) &&
    value !== "true" &&
    value !== "false" &&
    value !== "null" &&
    value !== "~" &&
    !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
  ) {
    return value;
  }
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`;
}

function joinMarkdown(yaml: string, body: string): string {
  if (body.length === 0) {
    return `---\n${yaml}\n---\n`;
  }
  if (body.startsWith("\n")) {
    return `---\n${yaml}\n---${body}`;
  }
  return `---\n${yaml}\n---\n${body}`;
}
