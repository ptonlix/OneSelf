import { projectMarkdown } from "@oneself/domain";
import type {
  Frontmatter,
  JsonValue,
  MarkdownParser,
  ParsedFact,
  ParsedTimelineEntry,
} from "@oneself/ports";

/**
 * Markdown port backed by the domain projection.
 * A failed fence returns no document, so the caller does not write.
 */
export function createMarkdownParser(): MarkdownParser {
  return {
    parse(markdown: string) {
      const projected = projectMarkdown(markdown);
      if (!projected.ok) {
        return { ok: false, message: projected.message };
      }
      const facts: ParsedFact[] = projected.value.facts.map((fact) => ({
        id: fact.id,
        entity: fact.entity,
        statement: fact.statement,
        confidence: fact.confidence,
        validUntil: fact.validUntil,
      }));
      const timeline: ParsedTimelineEntry[] = projected.value.timeline.map((entry) => ({
        occurredOn: entry.occurredOn,
        title: entry.title,
        detail: entry.detail,
      }));
      return {
        ok: true,
        document: {
          frontmatter: toPortFrontmatter(projected.value.frontmatter),
          body: projected.value.body,
          facts,
          timeline,
        },
      };
    },
  };
}

function toPortFrontmatter(value: Readonly<Record<string, unknown>>): Frontmatter {
  const frontmatter: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    frontmatter[key] = toJson(item);
  }
  return frontmatter;
}

function toJson(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJson(item));
  }
  return null;
}
