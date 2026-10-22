import path from "node:path";

import type { Hono } from "hono";

import { sendError } from "../app/json.ts";
import type { Runtime } from "../app/runtime.ts";

const RESERVED = new Set(["pcp", "oauth", ".well-known", "admin", "skills", "media", "_preview"]);

export function mountSiteFiles(app: Hono, runtime: Runtime): void {
  app.get("/_preview/:releaseId", (c) => servePreview(runtime, c.req.param("releaseId"), "/"));
  app.get("/_preview/:releaseId/*", (c) => {
    const releaseId = c.req.param("releaseId");
    const pathname = new URL(c.req.url).pathname;
    const prefix = `/_preview/${releaseId}`;
    const rest = pathname.slice(prefix.length);
    return servePreview(runtime, releaseId, rest.length === 0 ? "/" : rest);
  });

  app.notFound(async (c) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      return sendError("not_found", "not found");
    }
    const pathname = new URL(c.req.url).pathname;
    if (isReserved(pathname)) {
      return sendError("not_found", "not found");
    }
    const releaseId = await runtime.currentPointer();
    return serveRelease(runtime, releaseId, pathname);
  });
}

function isReserved(pathname: string): boolean {
  const first = pathname.split("/").find((part) => part.length > 0);
  return first !== undefined && RESERVED.has(first);
}

async function servePreview(
  runtime: Runtime,
  releaseId: string,
  pathname: string,
): Promise<Response> {
  return serveRelease(runtime, releaseId, pathname);
}

async function serveRelease(
  runtime: Runtime,
  releaseId: string,
  pathname: string,
): Promise<Response> {
  const relative = siteRelative(pathname);
  if (relative === null) {
    return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
  }
  for (const candidate of candidates(relative)) {
    const bytes =
      releaseId === "public-page"
        ? runtime.readPublicPage(candidate)
        : await runtime.readReleaseFile(releaseId, candidate);
    if (bytes === null) {
      continue;
    }
    return fileResponse(candidate, bytes);
  }
  return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
}

function siteRelative(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) {
    return null;
  }
  const trimmed = decoded.replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed.split("/").includes("..")) {
    return null;
  }
  return trimmed.length === 0 ? "index.html" : trimmed;
}

function candidates(relative: string): string[] {
  if (relative === "index.html" || relative.endsWith("/index.html")) {
    return [relative];
  }
  if (path.posix.basename(relative).includes(".")) {
    return [relative];
  }
  return [`${relative}/index.html`];
}

function fileResponse(relative: string, bytes: Uint8Array): Response {
  const headers = new Headers({ "content-type": contentType(relative) });
  if (relative === "index.html" || relative.endsWith("/index.html")) {
    headers.set("cache-control", "no-store");
  } else if (/[-.][A-Za-z0-9_]{8,}\.(?:js|css)$/.test(path.posix.basename(relative))) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  }
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}

function contentType(relative: string): string {
  const extension = path.posix.extname(relative).toLowerCase();
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".pdf":
      return "application/pdf";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}
