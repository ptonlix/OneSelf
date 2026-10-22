import type { DomainResult, PageEdit, PutPageInput } from "@oneself/domain";
import type { Context, Hono } from "hono";

import {
  isRecord,
  noStore,
  parseGrants,
  rateLimited,
  readJson,
  sendError,
  sendJson,
} from "../app/json.ts";
import { parseOperation } from "../app/schemas.ts";
import type { Actor, Runtime } from "../app/runtime.ts";
import { discoveryDocument, oauthMetadata, openApiDocument } from "./discovery.ts";

export function mountPcp(app: Hono, runtime: Runtime): void {
  app.get("/.well-known/pcp", () => sendJson(discoveryDocument(runtime.origin)));
  app.get("/.well-known/agent-skills/index.json", () =>
    sendJson(runtime.agentSkillsIndex(), 200, noStoreHeaders()),
  );
  app.get("/.well-known/oauth-authorization-server", () => sendJson(oauthMetadata(runtime.origin)));
  app.get("/openapi.json", () => sendJson(openApiDocument(runtime.origin)));

  app.get("/pcp/v1/public/sources", (c) =>
    publicResult(c, runtime, (actor) => runtime.publicSources(actor)),
  );
  app.get("/pcp/v1/public/pages", (c) =>
    publicResult(c, runtime, (actor) => runtime.publicPages(actor)),
  );
  app.get("/pcp/v1/public/pages/:source/:slug", (c) =>
    publicResult(c, runtime, (actor) =>
      runtime.publicPage(actor, c.req.param("source"), c.req.param("slug")),
    ),
  );
  app.post("/pcp/v1/public/search", async (c) => {
    if (!(await runtime.allow("search", runtime.clientAddress(c.req.raw)))) {
      return rateLimited();
    }
    const body = parseOperation("search", await jsonRecord(c));
    if (body === null) {
      return sendError("invalid", "search body is invalid");
    }
    return publicResult(c, runtime, (actor) => runtime.search(actor, body, true));
  });

  app.get("/skills/oneself/SKILL.md", () => skillFile(runtime, "oneself"));
  app.get("/skills/oneself.tar.gz", () => skillArchive(runtime));
  app.get("/skills/oneself/references/context.md", () => skillReference(runtime, "context.md"));
  app.get("/skills/oneself/references/public-page.md", () =>
    skillReference(runtime, "public-page.md"),
  );
  app.get("/pcp/v1/skills", (c) => authed(c, runtime, (actor) => runtime.listSkills(actor)));
  app.get("/pcp/v1/skills/:name", async (c) => {
    const actor = await runtime.authenticate(c.req.raw);
    const result = await runtime.readSkill(actor, c.req.param("name"));
    if (!result.ok) {
      return sendError(result.error, result.message);
    }
    return new Response(bytesBody(result.value), {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  });

  app.put("/pcp/v1/pages/:source/:slug/tags/:tag", (c) =>
    authed(c, runtime, (actor) =>
      runtime.addTag(actor, c.req.param("source"), c.req.param("slug"), c.req.param("tag")),
    ),
  );
  app.delete("/pcp/v1/pages/:source/:slug/tags/:tag", (c) =>
    authed(c, runtime, (actor) =>
      runtime.removeTag(actor, c.req.param("source"), c.req.param("slug"), c.req.param("tag")),
    ),
  );
  app.get("/pcp/v1/pages/:source/:slug/tags", (c) =>
    authed(c, runtime, (actor) =>
      runtime.getTags(actor, c.req.param("source"), c.req.param("slug")),
    ),
  );
  app.post("/pcp/v1/pages/:source/:slug/timeline", (c) =>
    authed(c, runtime, async (actor) => {
      const body = await jsonRecord(c);
      if (!isRecord(body) || typeof body.date !== "string" || typeof body.title !== "string") {
        return sendError("invalid", "timeline entry is invalid");
      }
      if (body.detail !== undefined && body.detail !== null && typeof body.detail !== "string") {
        return sendError("invalid", "timeline detail is invalid");
      }
      return resultOf(
        await runtime.addTimelineEntry(actor, c.req.param("source"), c.req.param("slug"), {
          date: body.date,
          title: body.title,
          detail: typeof body.detail === "string" ? body.detail : null,
        }),
      );
    }),
  );
  app.get("/pcp/v1/pages/:source/:slug/timeline", (c) =>
    authed(c, runtime, (actor) =>
      runtime.getTimeline(actor, c.req.param("source"), c.req.param("slug")),
    ),
  );
  app.get("/pcp/v1/pages/:source/:slug/links", (c) =>
    authed(c, runtime, (actor) =>
      runtime.getLinks(actor, c.req.param("source"), c.req.param("slug")),
    ),
  );
  app.get("/pcp/v1/pages/:source/:slug/backlinks", (c) =>
    authed(c, runtime, (actor) =>
      runtime.getBacklinks(actor, c.req.param("source"), c.req.param("slug")),
    ),
  );
  app.get("/pcp/v1/pages/:source/:slug/versions", (c) =>
    authed(c, runtime, (actor) =>
      runtime.versions(actor, c.req.param("source"), c.req.param("slug")),
    ),
  );
  app.post("/pcp/v1/pages/:source/:slug/restore", (c) =>
    authed(c, runtime, (actor) =>
      runtime.restorePage(actor, c.req.param("source"), c.req.param("slug")),
    ),
  );
  app.post("/pcp/v1/pages/:source/:slug/revert", (c) =>
    authed(c, runtime, async (actor) => {
      const body = await jsonRecord(c);
      if (!isRecord(body) || typeof body.hash !== "string") {
        return sendError("invalid", "hash is required");
      }
      return resultOf(
        await runtime.revert(actor, c.req.param("source"), c.req.param("slug"), body.hash),
      );
    }),
  );
  app.put("/pcp/v1/pages/:source/:slug", (c) =>
    authed(c, runtime, async (actor) => {
      const body = await jsonRecord(c);
      if (!isRecord(body) || typeof body.markdown !== "string") {
        return sendError("invalid", "markdown is required");
      }
      if (body.hash !== undefined && typeof body.hash !== "string") {
        return sendError("invalid", "hash is invalid");
      }
      const input: PutPageInput =
        typeof body.hash === "string"
          ? {
              source: c.req.param("source"),
              slug: c.req.param("slug"),
              markdown: body.markdown,
              hash: body.hash,
            }
          : { source: c.req.param("source"), slug: c.req.param("slug"), markdown: body.markdown };
      return resultOf(await runtime.putPage(actor, input));
    }),
  );
  app.patch("/pcp/v1/pages/:source/:slug", (c) =>
    authed(c, runtime, async (actor) => {
      const body = await jsonRecord(c);
      const edits = parseEdits(body);
      if (!isRecord(body) || typeof body.hash !== "string" || edits === null) {
        return sendError("invalid", "edit is invalid");
      }
      return resultOf(
        await runtime.editPage(actor, {
          source: c.req.param("source"),
          slug: c.req.param("slug"),
          hash: body.hash,
          edits,
        }),
      );
    }),
  );
  app.get("/pcp/v1/pages/:source/:slug", (c) =>
    authed(c, runtime, (actor) =>
      runtime.getPage(actor, c.req.param("source"), c.req.param("slug")),
    ),
  );
  app.delete("/pcp/v1/pages/:source/:slug", (c) =>
    authed(c, runtime, (actor) =>
      runtime.deletePage(actor, c.req.param("source"), c.req.param("slug")),
    ),
  );
  app.post("/pcp/v1/pages", (c) =>
    authed(c, runtime, async (actor) => {
      const body = await jsonRecord(c);
      const pages = isRecord(body) ? parsePages(body.pages) : null;
      if (pages === null) {
        return sendError("invalid", "pages are invalid");
      }
      return resultOf(await runtime.putPages(actor, pages));
    }),
  );
  app.get("/pcp/v1/pages", (c) => {
    const query: { source?: string; type?: string; prefix?: string } = {};
    const source = c.req.query("source");
    const type = c.req.query("type");
    const prefix = c.req.query("prefix");
    if (source !== undefined) {
      query.source = source;
    }
    if (type !== undefined) {
      query.type = type;
    }
    if (prefix !== undefined) {
      query.prefix = prefix;
    }
    return authed(c, runtime, (actor) => runtime.listPages(actor, query));
  });

  app.post("/pcp/v1/slugs/resolve", (c) =>
    authed(c, runtime, async (actor) => {
      const body = await jsonRecord(c);
      const slugs = isRecord(body) ? parseSlugPairs(body.slugs) : null;
      if (slugs === null) {
        return sendError("invalid", "slugs are invalid");
      }
      return resultOf(await runtime.resolve(actor, slugs));
    }),
  );
  app.post("/pcp/v1/files", (c) =>
    authed(c, runtime, async (actor) => {
      if (!(await runtime.allow("upload", runtime.clientAddress(c.req.raw)))) {
        return rateLimited();
      }
      const parsed = await c.req.parseBody();
      const file = parsed.file;
      if (!(file instanceof File)) {
        return sendError("invalid", "file is required");
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      return resultOf(await runtime.uploadFile(actor, bytes, file.type));
    }),
  );
  app.get("/pcp/v1/files/:id", (c) =>
    authed(c, runtime, (actor) => runtime.fileUrl(actor, c.req.param("id"))),
  );
  app.get("/pcp/v1/files", (c) =>
    authed(c, runtime, (actor) =>
      runtime.listFiles(actor, c.req.query("source"), c.req.query("slug")),
    ),
  );
  app.get("/media/:id", async (c) => {
    const actor = await runtime.authenticate(c.req.raw);
    const result = await runtime.readMedia(actor, c.req.param("id"));
    if (!result.ok) {
      return sendError(result.error, result.message);
    }
    return new Response(bytesBody(result.value.bytes), {
      status: 200,
      headers: {
        "content-type": result.value.mediaType,
        "cache-control": "no-store",
      },
    });
  });

  app.post("/pcp/v1/search", (c) =>
    authed(c, runtime, async (actor) => {
      const body = parseOperation("search", await jsonRecord(c));
      if (body === null) {
        return sendError("invalid", "search body is invalid");
      }
      return resultOf(await runtime.search(actor, body, false));
    }),
  );
  app.post("/pcp/v1/query", (c) =>
    authed(c, runtime, async (actor) => resultOf(await runtime.query(actor, await jsonRecord(c)))),
  );
  app.post("/pcp/v1/links", (c) => linkWrite(c, runtime, "add"));
  app.delete("/pcp/v1/links", (c) => linkWrite(c, runtime, "remove"));
  app.post("/pcp/v1/facts", (c) =>
    authed(c, runtime, async (actor) => {
      const body = await jsonRecord(c);
      const fact = parseFact(body);
      if (fact === null) {
        return sendError("invalid", "fact is invalid");
      }
      return resultOf(await runtime.remember(actor, fact));
    }),
  );
  app.post("/pcp/v1/facts/:id/forget", (c) =>
    authed(c, runtime, async (actor) => {
      const body = await jsonRecord(c);
      if (!isRecord(body) || typeof body.source !== "string" || typeof body.slug !== "string") {
        return sendError("invalid", "fact page is required");
      }
      return resultOf(await runtime.forget(actor, body.source, body.slug, c.req.param("id")));
    }),
  );
  app.post("/pcp/v1/recall", (c) =>
    authed(c, runtime, async (actor) => resultOf(await runtime.recall(actor, await jsonRecord(c)))),
  );

  app.get("/pcp/v1/sources", (c) => authed(c, runtime, (actor) => runtime.sourcesList(actor)));
  app.post("/pcp/v1/sources", (c) =>
    authed(c, runtime, async (actor) => {
      const body = await jsonRecord(c);
      if (!isRecord(body) || typeof body.id !== "string") {
        return sendError("invalid", "source is invalid");
      }
      return resultOf(await runtime.sourcesAdd(actor, body.id));
    }),
  );
  app.post("/pcp/v1/sources/:id/restore", (c) =>
    authed(c, runtime, (actor) => runtime.sourcesRestore(actor, c.req.param("id"))),
  );
  app.delete("/pcp/v1/sources/:id", (c) =>
    authed(c, runtime, (actor) => runtime.sourcesDelete(actor, c.req.param("id"))),
  );
  app.get("/pcp/v1/sources/:id", (c) =>
    authed(c, runtime, (actor) => runtime.sourcesStatus(actor, c.req.param("id"))),
  );
  app.get("/pcp/v1/whoami", (c) => authed(c, runtime, (actor) => runtime.whoami(actor)));

  app.get("/pcp/v1/site/source", async (c) => {
    const actor = await runtime.authenticate(c.req.raw);
    const result = await runtime.siteSourceZip(actor);
    if (!result.ok) {
      return sendError(result.error, result.message);
    }
    return new Response(bytesBody(result.value), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="public-page-source.zip"',
      },
    });
  });
  app.post("/pcp/v1/site/releases/:id/preview", (c) =>
    authed(c, runtime, (actor) => runtime.preview(actor, c.req.param("id"))),
  );
  app.post("/pcp/v1/site/releases", (c) =>
    authed(c, runtime, async (actor) => {
      if (!(await runtime.allow("upload", runtime.clientAddress(c.req.raw)))) {
        return rateLimited();
      }
      const parsed = await c.req.parseBody();
      const archive = parsed.archive;
      if (!(archive instanceof File)) {
        return sendError("invalid", "archive is required");
      }
      return resultOf(await runtime.putSite(actor, new Uint8Array(await archive.arrayBuffer())));
    }),
  );
  app.get("/pcp/v1/site", (c) => authed(c, runtime, (actor) => runtime.listSites(actor)));
  app.post("/pcp/v1/site/activate", (c) =>
    authed(c, runtime, async (actor) => {
      const body = await jsonRecord(c);
      if (!isRecord(body) || typeof body.release_id !== "string") {
        return sendError("invalid", "release id is required");
      }
      return resultOf(await runtime.activate(actor, body.release_id));
    }),
  );

  app.post("/pcp/v1/api-keys", (c) =>
    authed(c, runtime, async (actor) => {
      const body = await jsonRecord(c);
      if (
        !isRecord(body) ||
        typeof body.label !== "string" ||
        body.label.length === 0 ||
        typeof body.unrestricted_data !== "boolean" ||
        typeof body.site_write !== "boolean"
      ) {
        return sendError("invalid", "api key request is invalid");
      }
      const sources = parseGrants(body.sources);
      if (sources === null) {
        return sendError("invalid", "sources are invalid");
      }
      return resultOf(
        await runtime.createApiKey(actor, {
          label: body.label,
          unrestrictedData: body.unrestricted_data,
          siteWrite: body.site_write,
          sources,
        }),
      );
    }),
  );
  app.get("/pcp/v1/api-keys", (c) => authed(c, runtime, (actor) => runtime.listApiKeys(actor)));
  app.delete("/pcp/v1/api-keys/:id", (c) =>
    authed(c, runtime, (actor) => runtime.revokeApiKey(actor, c.req.param("id"))),
  );
}

function skillFile(runtime: Runtime, name: string): Response {
  const bytes = runtime.skillBytes(name);
  if (bytes === null) {
    return sendError("not_found", "skill not found");
  }
  return markdown(bytes);
}

function skillReference(runtime: Runtime, name: string): Response {
  const bytes = runtime.skillReference(name);
  if (bytes === null) {
    return sendError("not_found", "skill not found");
  }
  return markdown(bytes);
}

function skillArchive(runtime: Runtime): Response {
  return new Response(bytesBody(runtime.skillArchive()), {
    status: 200,
    headers: {
      "content-type": "application/gzip",
      "cache-control": "no-store",
    },
  });
}

function markdown(bytes: Uint8Array): Response {
  return new Response(bytesBody(bytes), {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function noStoreHeaders(): Headers {
  return new Headers({ "cache-control": "no-store" });
}

async function publicResult(
  c: Context,
  runtime: Runtime,
  run: (actor: Actor) => Promise<DomainResult<unknown>>,
): Promise<Response> {
  const actor = await runtime.authenticate(c.req.raw);
  const blocked = runtime.passwordBlocked(actor);
  if (blocked !== null) {
    return noStore(sendError(blocked.error, blocked.message));
  }
  return noStore(resultOf(await run(actor)));
}

async function authed(
  c: Context,
  runtime: Runtime,
  run: (actor: Actor) => Promise<DomainResult<unknown> | Response>,
): Promise<Response> {
  try {
    const actor = await runtime.authenticate(c.req.raw);
    return resultOf(await run(actor));
  } catch {
    return sendError("invalid", "request body is invalid");
  }
}

async function jsonRecord(c: Context): Promise<unknown> {
  return readJson(c.req.raw);
}

function resultOf(result: DomainResult<unknown> | Response): Response {
  if (result instanceof Response) {
    return result;
  }
  if (!result.ok) {
    return sendError(result.error, result.message);
  }
  return sendJson(result.value);
}

function parseEdits(body: unknown): PageEdit[] | null {
  if (!isRecord(body) || !Array.isArray(body.edits)) {
    return null;
  }
  const edits: PageEdit[] = [];
  for (const edit of body.edits) {
    if (!isRecord(edit) || typeof edit.search !== "string" || typeof edit.replace !== "string") {
      return null;
    }
    edits.push({ search: edit.search, replace: edit.replace });
  }
  return edits;
}

function parsePages(value: unknown): PutPageInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const pages: PutPageInput[] = [];
  for (const page of value) {
    if (
      !isRecord(page) ||
      typeof page.source !== "string" ||
      typeof page.slug !== "string" ||
      typeof page.markdown !== "string"
    ) {
      return null;
    }
    if (page.hash !== undefined && typeof page.hash !== "string") {
      return null;
    }
    pages.push(
      typeof page.hash === "string"
        ? { source: page.source, slug: page.slug, markdown: page.markdown, hash: page.hash }
        : { source: page.source, slug: page.slug, markdown: page.markdown },
    );
  }
  return pages;
}

function parseSlugPairs(value: unknown): { source: string; slug: string }[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const pairs: { source: string; slug: string }[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.source !== "string" || typeof item.slug !== "string") {
      return null;
    }
    pairs.push({ source: item.source, slug: item.slug });
  }
  return pairs;
}

function parseFact(body: unknown): {
  source: string;
  slug: string;
  id?: string;
  entity: string;
  statement: string;
  confidence: number | null;
  validUntil: string | null;
} | null {
  if (!isRecord(body) || typeof body.source !== "string" || typeof body.slug !== "string") {
    return null;
  }
  if (typeof body.entity !== "string" || typeof body.statement !== "string") {
    return null;
  }
  if (body.id !== undefined && typeof body.id !== "string") {
    return null;
  }
  if (
    body.confidence !== undefined &&
    body.confidence !== null &&
    typeof body.confidence !== "number"
  ) {
    return null;
  }
  if (
    body.valid_until !== undefined &&
    body.valid_until !== null &&
    typeof body.valid_until !== "string"
  ) {
    return null;
  }
  return {
    source: body.source,
    slug: body.slug,
    ...(typeof body.id === "string" ? { id: body.id } : {}),
    entity: body.entity,
    statement: body.statement,
    confidence: typeof body.confidence === "number" ? body.confidence : null,
    validUntil: typeof body.valid_until === "string" ? body.valid_until : null,
  };
}

async function linkWrite(
  c: Context,
  runtime: Runtime,
  action: "add" | "remove",
): Promise<Response> {
  return authed(c, runtime, async (actor) => {
    const body = await jsonRecord(c);
    const ends = parseLinkEnds(body);
    if (ends === null) {
      return sendError("invalid", "link is invalid");
    }
    const result =
      action === "add"
        ? await runtime.addLink(actor, ends.from, ends.to)
        : await runtime.removeLink(actor, ends.from, ends.to);
    return resultOf(result);
  });
}

function parseLinkEnds(
  body: unknown,
): { from: { source: string; slug: string }; to: { source: string; slug: string } } | null {
  if (!isRecord(body) || !isRecord(body.from) || !isRecord(body.to)) {
    return null;
  }
  if (
    typeof body.from.source !== "string" ||
    typeof body.from.slug !== "string" ||
    typeof body.to.source !== "string" ||
    typeof body.to.slug !== "string"
  ) {
    return null;
  }
  return {
    from: { source: body.from.source, slug: body.from.slug },
    to: { source: body.to.source, slug: body.to.slug },
  };
}

function bytesBody(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}
