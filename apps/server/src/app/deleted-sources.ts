import { isPastRetention, SOFT_DELETE_RETENTION_MS } from "@oneself/domain";

import { parseLimit, parseOffset } from "./search.ts";

export type DeletedSourcePage = {
  readonly id: string;
  readonly deleted_at: string;
};

const DEFAULT_LIMIT = 20;

/** 30 days is the retention window. The page size is separate and is not a row cap. */
export function deletedSourcePage(
  sources: readonly { readonly id: string; readonly deletedAt: string | null }[],
  now: string,
  limit: number,
  offset: number,
): DeletedSourcePage[] {
  const kept = sources.filter(
    (source): source is { id: string; deletedAt: string } =>
      source.deletedAt !== null &&
      !isPastRetention(source.deletedAt, now, SOFT_DELETE_RETENTION_MS),
  );
  kept.sort(
    (left, right) =>
      right.deletedAt.localeCompare(left.deletedAt) || left.id.localeCompare(right.id),
  );
  return kept.slice(offset, offset + limit).map((source) => ({
    id: source.id,
    deleted_at: source.deletedAt,
  }));
}

export function parseDeletedSourceQuery(
  limit: string | undefined,
  cursor: string | undefined,
): { readonly limit: number; readonly offset: number } | null {
  const parsedLimit = limit === undefined ? DEFAULT_LIMIT : parseLimit(Number(limit));
  if (limit !== undefined && !/^\d+$/.test(limit)) return null;
  if (parsedLimit === null) return null;
  const offset = parseOffset(cursor);
  if (offset === null) return null;
  return { limit: parsedLimit, offset };
}
