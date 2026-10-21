import { z } from "zod";

import { chunkBody, type PageChunk } from "./chunks.js";
import { parseFences, type Fact, type TimelineEntry } from "./fences.js";
import {
  parseFrontmatterBlock,
  splitFrontmatter,
  type Frontmatter,
  type FrontmatterValue,
} from "./frontmatter.js";
import { isTypeName } from "./identity.js";
import { extractLinks, type PageLink } from "./links.js";
import { fail, ok, type DomainResult } from "./result.js";

export type Visibility = "public" | "private";

export type PageProjection = {
  readonly type: string;
  readonly title: string;
  readonly visibility: Visibility;
  readonly frontmatter: Frontmatter;
  readonly body: string;
  readonly tags: readonly string[];
  readonly fileIds: readonly string[];
  readonly chunks: readonly PageChunk[];
  readonly links: readonly PageLink[];
  readonly facts: readonly Fact[];
  readonly timeline: readonly TimelineEntry[];
};

export function projectMarkdown(markdown: string): DomainResult<PageProjection> {
  const split = splitFrontmatter(markdown);
  if (!split) {
    return fail("invalid", "frontmatter is required");
  }
  const parsed = parseFrontmatterBlock(split.yaml);
  if (!parsed.ok) {
    return parsed;
  }
  const fields = readFields(parsed.value);
  if (!fields.ok) {
    return fields;
  }
  const fences = parseFences(split.body);
  if (!fences.ok) {
    return fences;
  }
  return ok({
    type: fields.value.type,
    title: fields.value.title,
    visibility: fields.value.visibility,
    frontmatter: parsed.value,
    body: split.body,
    tags: fields.value.tags,
    fileIds: fields.value.fileIds,
    chunks: chunkBody(split.body),
    links: extractLinks(split.body),
    facts: fences.value.facts,
    timeline: fences.value.timeline,
  });
}

const frontmatterSchema = z.looseObject({
  type: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/),
  title: z.string().min(1),
  visibility: z.enum(["public", "private"]).optional(),
  tags: z.array(z.string().min(1)).optional(),
  files: z.array(z.string().min(1)).optional(),
});

function readFields(frontmatter: Frontmatter): DomainResult<{
  type: string;
  title: string;
  visibility: Visibility;
  tags: string[];
  fileIds: string[];
}> {
  if (!frontmatterSchema.safeParse(frontmatter).success) {
    return fail("invalid", "frontmatter is invalid");
  }
  const type = frontmatter["type"];
  if (typeof type !== "string" || !isTypeName(type)) {
    return fail("invalid", "type is required");
  }
  const title = frontmatter["title"];
  if (typeof title !== "string" || title.length === 0) {
    return fail("invalid", "title is required");
  }
  const visibility = readVisibility(frontmatter);
  if (!visibility.ok) {
    return visibility;
  }
  const tags = readStringArray(frontmatter["tags"], "tags");
  if (!tags.ok) {
    return tags;
  }
  const fileIds = readStringArray(frontmatter["files"], "files");
  if (!fileIds.ok) {
    return fileIds;
  }
  if (new Set(fileIds.value).size !== fileIds.value.length) {
    return fail("invalid", "files lists a duplicate id");
  }
  return ok({
    type,
    title,
    visibility: visibility.value,
    tags: uniqueStrings(tags.value),
    fileIds: fileIds.value,
  });
}

function readVisibility(frontmatter: Frontmatter): DomainResult<Visibility> {
  if (!Object.hasOwn(frontmatter, "visibility")) {
    return ok("private");
  }
  const value = frontmatter["visibility"];
  if (value === "public" || value === "private") {
    return ok(value);
  }
  return fail("invalid", "visibility must be public or private");
}

function readStringArray(
  value: FrontmatterValue | undefined,
  label: string,
): DomainResult<string[]> {
  if (value === undefined) {
    return ok([]);
  }
  if (!Array.isArray(value)) {
    return fail("invalid", `${label} must be a string array`);
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) {
      return fail("invalid", `${label} must be a string array`);
    }
    items.push(item);
  }
  return ok(items);
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique;
}
