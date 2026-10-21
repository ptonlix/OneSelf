import { sourceFlags, type Credential, type DomainState, type PageRecord } from "@oneself/domain";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SNIPPET_MAX = 140;

export type SearchHit = {
  readonly source: string;
  readonly slug: string;
  readonly type: string;
  readonly title: string;
  readonly snippet: string;
};

export type SearchQuery = {
  readonly q: string;
  readonly source?: string;
  readonly limit: number;
  readonly offset: number;
};

/**
 * Searches the page projection only: type, title, body, and frontmatter strings.
 * Chunk rows are not a search document.
 */
export function searchPages(
  state: DomainState,
  credential: Credential,
  query: SearchQuery,
  publicOnly: boolean,
): readonly SearchHit[] {
  const hits: SearchHit[] = [];
  for (const page of visiblePages(state, credential, publicOnly)) {
    if (query.source !== undefined && page.source !== query.source) {
      continue;
    }
    const snippet = matchSnippet(page, query.q);
    if (snippet === null) {
      continue;
    }
    hits.push({
      source: page.source,
      slug: page.slug,
      type: page.type,
      title: page.title,
      snippet,
    });
  }
  hits.sort((left, right) =>
    left.source === right.source
      ? left.slug.localeCompare(right.slug)
      : left.source.localeCompare(right.source),
  );
  return hits.slice(query.offset, query.offset + query.limit);
}

export function parseLimit(value: unknown): number | null {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    return null;
  }
  return value;
}

export function parseOffset(cursor: unknown): number | null {
  if (cursor === undefined) {
    return 0;
  }
  if (typeof cursor !== "string" || !/^\d+$/.test(cursor)) {
    return null;
  }
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset)) {
    return null;
  }
  return offset;
}

export function visiblePages(
  state: DomainState,
  credential: Credential,
  publicOnly: boolean,
): readonly PageRecord[] {
  const pages: PageRecord[] = [];
  for (const page of state.pages) {
    if (page.deletedAt !== null || page.hiddenBySource) {
      continue;
    }
    const source = state.sources.find((item) => item.id === page.source);
    if (source === undefined || source.deletedAt !== null) {
      continue;
    }
    if (publicOnly) {
      if (page.visibility === "public") {
        pages.push(page);
      }
      continue;
    }
    if (credential.kind === "anonymous" || !sourceFlags(credential, page.source).read) {
      continue;
    }
    pages.push(page);
  }
  return pages;
}

export function buildSnippet(
  page: {
    readonly type: string;
    readonly title: string;
    readonly body: string;
    readonly frontmatter: unknown;
  },
  q: string,
): string | null {
  if (q.length === 0) {
    return null;
  }
  if (page.type.includes(q)) {
    return clip(page.type, q);
  }
  if (page.title.includes(q)) {
    return clip(page.title, q);
  }
  if (page.body.includes(q)) {
    return clip(page.body, q);
  }
  const frontmatter = isFrontmatter(page.frontmatter) ? page.frontmatter : {};
  for (const value of Object.values(frontmatter)) {
    if (typeof value === "string" && value.includes(q)) {
      return clip(value, q);
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.includes(q)) {
          return clip(item, q);
        }
      }
    }
  }
  return null;
}

function isFrontmatter(value: unknown): value is PageRecord["frontmatter"] {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchSnippet(page: PageRecord, q: string): string | null {
  return buildSnippet(page, q);
}

function clip(text: string, q: string): string {
  const index = text.indexOf(q);
  const start = Math.max(0, index - 20);
  return text.slice(start, start + SNIPPET_MAX);
}
