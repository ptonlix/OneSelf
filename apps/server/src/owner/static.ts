import path from "node:path";

import type { Context, Hono } from "hono";

import type { Runtime } from "../app/runtime.ts";

const ADMIN_PAGES = new Set([
  "",
  "login",
  "password",
  "device",
  "api-keys/new",
  "site-activations/new",
]);

export function wantsJson(request: Request): boolean {
  const accept = request.headers.get("accept");
  if (accept === null) {
    return false;
  }
  return accept
    .split(",")
    .some((part) => part.split(";")[0]?.trim().toLowerCase() === "application/json");
}

export function mountAdminPages(app: Hono, runtime: Runtime): void {
  app.get("/admin", (c) => adminPage(runtime, c));
  app.get("/admin/", (c) => adminPage(runtime, c));
  app.get("/admin/*", (c) => adminPage(runtime, c));
}

export function adminPage(runtime: Runtime, c: Context): Response {
  const pathname = new URL(c.req.url).pathname;
  const relative = adminRelative(pathname);
  if (relative === null) {
    return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
  }
  const file = runtime.readAdmin(relative);
  if (file !== null) {
    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        "content-type": adminContentType(relative),
        "cache-control":
          relative === "index.html" ? "no-store" : "public, max-age=31536000, immutable",
      },
    });
  }
  if (isAdminSpa(relative)) {
    const index = runtime.readAdmin("index.html");
    if (index !== null) {
      return new Response(new Uint8Array(index), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
  }
  return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
}

function adminRelative(pathname: string): string | null {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) {
    return null;
  }
  const rest = pathname.slice("/admin".length).replace(/^\/+/, "");
  if (rest.includes("..") || rest.includes("\\") || rest.includes("\0")) {
    return null;
  }
  return rest.length === 0 ? "index.html" : rest;
}

function isAdminSpa(relative: string): boolean {
  if (ADMIN_PAGES.has(relative)) {
    return true;
  }
  if (relative.startsWith("api-keys/") && !relative.slice("api-keys/".length).includes("/")) {
    return true;
  }
  return (
    relative.startsWith("site-activations/") &&
    !relative.slice("site-activations/".length).includes("/")
  );
}

function adminContentType(relative: string): string {
  switch (path.posix.extname(relative).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".map":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
