import { fail, ok, type DomainResult } from "./result.js";

export type Fact = {
  readonly id: string;
  readonly entity: string;
  readonly statement: string;
  readonly confidence: number | null;
  readonly validUntil: string | null;
};

export type TimelineEntry = {
  readonly ordinal: number;
  readonly occurredOn: string;
  readonly title: string;
  readonly detail: string | null;
};

const FACT_KEYS = new Set(["id", "entity", "statement", "confidence", "valid_until"]);
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseFences(
  body: string,
): DomainResult<{ facts: Fact[]; timeline: TimelineEntry[] }> {
  const lines = body.split(/\r?\n/);
  const facts: Fact[] = [];
  const timeline: TimelineEntry[] = [];
  let mode: "body" | "facts" | "timeline" = "body";
  let seenFacts = false;
  let seenTimeline = false;
  let current: Map<string, string> | null = null;

  const flush = (): DomainResult<null> => {
    if (current === null) {
      return ok(null);
    }
    const fact = finishFact(current, facts);
    current = null;
    if (!fact.ok) {
      return fact;
    }
    facts.push(fact.value);
    return ok(null);
  };

  for (const line of lines) {
    const heading = line.trimEnd();
    if (heading === "## Facts" || heading === "## Timeline") {
      const flushed = flush();
      if (!flushed.ok) {
        return flushed;
      }
      if (heading === "## Facts") {
        if (seenFacts) {
          return fail("invalid", "duplicate Facts fence");
        }
        seenFacts = true;
        mode = "facts";
      } else {
        if (seenTimeline) {
          return fail("invalid", "duplicate Timeline fence");
        }
        seenTimeline = true;
        mode = "timeline";
      }
      continue;
    }
    if (/^## /.test(line)) {
      const flushed = flush();
      if (!flushed.ok) {
        return flushed;
      }
      mode = "body";
      continue;
    }
    if (mode === "body") {
      continue;
    }
    if (line.trim() === "") {
      if (mode === "facts") {
        const flushed = flush();
        if (!flushed.ok) {
          return flushed;
        }
      }
      continue;
    }
    if (mode === "timeline") {
      const entry = parseTimelineLine(line, timeline.length);
      if (!entry.ok) {
        return entry;
      }
      timeline.push(entry.value);
      continue;
    }
    const itemStart = /^- ([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (itemStart) {
      const flushed = flush();
      if (!flushed.ok) {
        return flushed;
      }
      const key = itemStart[1] ?? "";
      const value = (itemStart[2] ?? "").trim();
      const recorded = recordFactKey(new Map(), key, value);
      if (!recorded.ok) {
        return recorded;
      }
      current = recorded.value;
      continue;
    }
    const continuation = /^ {2,}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!continuation || current === null) {
      return fail("invalid", "Facts fence could not be parsed");
    }
    const key = continuation[1] ?? "";
    const value = (continuation[2] ?? "").trim();
    const recorded = recordFactKey(current, key, value);
    if (!recorded.ok) {
      return recorded;
    }
    current = recorded.value;
  }
  const flushed = flush();
  if (!flushed.ok) {
    return flushed;
  }
  return ok({ facts, timeline });
}

function recordFactKey(
  fields: Map<string, string>,
  key: string,
  value: string,
): DomainResult<Map<string, string>> {
  if (!FACT_KEYS.has(key)) {
    return fail("invalid", "Facts item has an unknown field");
  }
  if (fields.has(key)) {
    return fail("invalid", "Facts item repeats a field");
  }
  if (value.length === 0) {
    return fail("invalid", "Facts item has an empty field");
  }
  const next = new Map(fields);
  next.set(key, value);
  return ok(next);
}

function finishFact(fields: Map<string, string>, existing: readonly Fact[]): DomainResult<Fact> {
  const id = fields.get("id");
  const entity = fields.get("entity");
  const statement = fields.get("statement");
  if (id === undefined || entity === undefined || statement === undefined) {
    return fail("invalid", "Facts item requires id, entity, and statement");
  }
  if (existing.some((fact) => fact.id === id)) {
    return fail("invalid", "Facts item id is duplicated");
  }
  const confidenceText = fields.get("confidence");
  let confidence: number | null = null;
  if (confidenceText !== undefined) {
    const parsedConfidence = parseConfidence(confidenceText);
    if (!parsedConfidence.ok) {
      return parsedConfidence;
    }
    confidence = parsedConfidence.value;
  }
  const validUntilText = fields.get("valid_until");
  let validUntil: string | null = null;
  if (validUntilText !== undefined) {
    if (!isCalendarDate(validUntilText)) {
      return fail("invalid", "Facts valid_until must be YYYY-MM-DD");
    }
    validUntil = validUntilText;
  }
  return ok({ id, entity, statement, confidence, validUntil });
}

function parseConfidence(text: string): DomainResult<number> {
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(text)) {
    return fail("invalid", "Facts confidence must be from 0 to 1");
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fail("invalid", "Facts confidence must be from 0 to 1");
  }
  return ok(parsed);
}

function parseTimelineLine(line: string, ordinal: number): DomainResult<TimelineEntry> {
  const item = /^- (.+)$/.exec(line);
  if (!item) {
    return fail("invalid", "Timeline fence could not be parsed");
  }
  const text = item[1] ?? "";
  const parts = text.split(" | ");
  if (parts.length < 2) {
    return fail("invalid", "Timeline entry must be date | title | detail");
  }
  const occurredOn = (parts[0] ?? "").trim();
  const title = (parts[1] ?? "").trim().replace(/\|$/, "").trim();
  if (!isCalendarDate(occurredOn)) {
    return fail("invalid", "Timeline date must be YYYY-MM-DD");
  }
  if (title.length === 0) {
    return fail("invalid", "Timeline title is required");
  }
  const detailParts = parts.slice(2);
  const detail = detailParts.length === 0 ? null : detailParts.join(" | ").trim();
  return ok({
    ordinal,
    occurredOn,
    title,
    detail: detail === "" ? null : detail,
  });
}

function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
