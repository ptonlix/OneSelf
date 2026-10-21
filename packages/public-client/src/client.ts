/**
 * Anonymous public PCP client.
 *
 * List and search bodies are JSON arrays of the documented item fields.
 * The architecture names those fields and no wrapper key, so an object
 * envelope is rejected instead of guessing one. Public source items have
 * no documented shape, so that body is returned uninterpreted.
 * Every request uses `credentials: "omit"` and drops credential headers.
 */

export type PublicFetch = (input: string, init: RequestInit) => Promise<Response>;

export type PublicClientOptions = {
  readonly fetch?: PublicFetch;
  readonly baseUrl?: string;
};

export type PublicPageSummary = {
  readonly source: string;
  readonly slug: string;
  readonly type: string;
  readonly title: string;
};

export type PublicPage = {
  readonly source: string;
  readonly slug: string;
  readonly type: string;
  readonly title: string;
  readonly visibility: "public";
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly markdown: string;
  readonly hash: string;
};

export type PublicSearchHit = {
  readonly source: string;
  readonly slug: string;
  readonly type: string;
  readonly title: string;
  readonly snippet: string;
};

export type PublicSearchQuery = {
  readonly q: string;
  readonly source?: string;
  readonly limit?: number;
  readonly cursor?: string;
};

export type PublicMedia = {
  readonly id: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
};

export type PublicClient = {
  listSources(): Promise<unknown>;
  listPages(): Promise<readonly PublicPageSummary[]>;
  getPage(source: string, slug: string): Promise<PublicPage>;
  search(query: PublicSearchQuery): Promise<readonly PublicSearchHit[]>;
  getMedia(id: string): Promise<PublicMedia>;
};

export class PublicClientFailure extends Error {
  readonly error: string;
  readonly status: number;

  constructor(error: string, message: string, status: number) {
    super(message);
    this.name = "PublicClientFailure";
    this.error = error;
    this.status = status;
  }
}

const SNIPPET_MAX = 140;
const SEARCH_LIMIT_MAX = 50;

export function createPublicClient(options: PublicClientOptions = {}): PublicClient {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const baseUrl = options.baseUrl ?? "";

  async function request(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.delete("authorization");
    headers.delete("cookie");
    headers.delete("x-api-key");
    return fetchImpl(resolveUrl(baseUrl, path), {
      ...init,
      headers,
      credentials: "omit",
      cache: "no-store",
    });
  }

  async function requestJson(path: string, init: RequestInit): Promise<unknown> {
    const response = await request(path, init);
    return readJson(response);
  }

  return {
    async listSources() {
      return requestJson("/pcp/v1/public/sources", { method: "GET", headers: acceptJson() });
    },

    async listPages() {
      const body = await requestJson("/pcp/v1/public/pages", {
        method: "GET",
        headers: acceptJson(),
      });
      return parsePageList(body);
    },

    async getPage(source, slug) {
      assertSegment("source", source);
      assertSegment("slug", slug);
      const body = await requestJson(pagePath(source, slug), {
        method: "GET",
        headers: acceptJson(),
      });
      return parsePage(body);
    },

    async search(query) {
      const body = await requestJson("/pcp/v1/public/search", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(searchPayload(query)),
      });
      return parseSearchHits(body);
    },

    async getMedia(id) {
      assertSegment("id", id);
      const response = await request(mediaPath(id), { method: "GET" });
      if (!response.ok) {
        throw await failureFrom(response);
      }
      const mediaType = mediaTypeOf(response.headers.get("content-type"));
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { id, mediaType, bytes };
    },
  };
}

function acceptJson(): Headers {
  const headers = new Headers();
  headers.set("accept", "application/json");
  return headers;
}

function jsonHeaders(): Headers {
  const headers = acceptJson();
  headers.set("content-type", "application/json");
  return headers;
}

function resolveUrl(baseUrl: string, path: string): string {
  if (baseUrl.length === 0) {
    return path;
  }
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function pagePath(source: string, slug: string): string {
  return `/pcp/v1/public/pages/${encodeURIComponent(source)}/${encodeURIComponent(slug)}`;
}

function mediaPath(id: string): string {
  return `/media/${encodeURIComponent(id)}`;
}

function assertSegment(name: string, value: string): void {
  if (value.length === 0 || value.includes("/")) {
    throw new PublicClientFailure("invalid", `${name} is empty or contains a slash.`, 0);
  }
}

function searchPayload(query: PublicSearchQuery): Record<string, string | number> {
  if (typeof query.q !== "string") {
    throw new PublicClientFailure("invalid", "Search q must be a string.", 0);
  }
  const payload: Record<string, string | number> = { q: query.q };
  if (query.source !== undefined) {
    payload.source = query.source;
  }
  if (query.limit !== undefined) {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > SEARCH_LIMIT_MAX) {
      throw new PublicClientFailure("invalid", "Search limit must be an integer from 1 to 50.", 0);
    }
    payload.limit = query.limit;
  }
  if (query.cursor !== undefined) {
    payload.cursor = query.cursor;
  }
  return payload;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw await failureFrom(response);
  }
  return parseJsonBody(response);
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PublicClientFailure("invalid", "Response is not JSON.", response.status);
  }
}

async function failureFrom(response: Response): Promise<PublicClientFailure> {
  let body: unknown = null;
  try {
    body = await parseJsonBody(response);
  } catch (error) {
    if (response.status === 404) {
      return new PublicClientFailure("not_found", "Not found.", 404);
    }
    if (error instanceof PublicClientFailure) {
      return error;
    }
    throw error;
  }
  if (isRecord(body) && typeof body.error === "string" && typeof body.message === "string") {
    return new PublicClientFailure(body.error, body.message, response.status);
  }
  if (response.status === 404) {
    return new PublicClientFailure("not_found", "Not found.", 404);
  }
  return new PublicClientFailure("invalid", "Public PCP request failed.", response.status);
}

function parsePageList(value: unknown): readonly PublicPageSummary[] {
  if (!Array.isArray(value)) {
    throw new PublicClientFailure("invalid", "Public page list must be a JSON array.", 200);
  }
  return value.map((item) => parseSummary(item));
}

function parseSummary(value: unknown): PublicPageSummary {
  if (!isRecord(value)) {
    throw new PublicClientFailure("invalid", "Public page list item is not an object.", 200);
  }
  return {
    source: requiredString(value, "source"),
    slug: requiredString(value, "slug"),
    type: requiredString(value, "type"),
    title: requiredString(value, "title"),
  };
}

function parsePage(value: unknown): PublicPage {
  if (!isRecord(value)) {
    throw new PublicClientFailure("invalid", "Public page is not an object.", 200);
  }
  if (value.visibility !== "public") {
    throw new PublicClientFailure("not_found", "Public page read is not public.", 404);
  }
  if (!isRecord(value.frontmatter)) {
    throw new PublicClientFailure("invalid", "Public page frontmatter is not an object.", 200);
  }
  return {
    source: requiredString(value, "source"),
    slug: requiredString(value, "slug"),
    type: requiredString(value, "type"),
    title: requiredString(value, "title"),
    visibility: "public",
    frontmatter: value.frontmatter,
    markdown: requiredString(value, "markdown"),
    hash: requiredString(value, "hash"),
  };
}

function parseSearchHits(value: unknown): readonly PublicSearchHit[] {
  if (!Array.isArray(value)) {
    throw new PublicClientFailure("invalid", "Public search hits must be a JSON array.", 200);
  }
  return value.map((item) => parseHit(item));
}

function parseHit(value: unknown): PublicSearchHit {
  if (!isRecord(value)) {
    throw new PublicClientFailure("invalid", "Public search hit is not an object.", 200);
  }
  const snippet = requiredString(value, "snippet");
  if (snippet.length > SNIPPET_MAX) {
    throw new PublicClientFailure("invalid", "Search snippet is longer than 140 characters.", 200);
  }
  return {
    source: requiredString(value, "source"),
    slug: requiredString(value, "slug"),
    type: requiredString(value, "type"),
    title: requiredString(value, "title"),
    snippet,
  };
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new PublicClientFailure("invalid", `Missing string field ${key}.`, 200);
  }
  return value;
}

function mediaTypeOf(header: string | null): string {
  if (header === null) {
    return "";
  }
  const [type] = header.split(";", 1);
  return type?.trim().toLowerCase() ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
