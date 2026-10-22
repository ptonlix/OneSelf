import type { Hono } from "hono";

import { isRecord, parseGrants, rateLimited, sendError, sendJson } from "../app/json.ts";
import type { Runtime } from "../app/runtime.ts";

export function mountOauth(app: Hono, runtime: Runtime): void {
  app.post("/oauth/device/auth", async (c) => {
    if (!(await runtime.allow("device", runtime.clientAddress(c.req.raw)))) {
      return rateLimited();
    }
    return runtime.oauthRequest(c.req.raw, "/device/auth");
  });
  app.post("/oauth/token", async (c) => runtime.oauthRequest(c.req.raw, "/token"));
  if (runtime.oauthAuthorizationCode) {
    app.post("/oauth/authorize", async (c) => {
      const actor = await runtime.authenticate(c.req.raw);
      const body = await readBody(c.req.raw);
      if (
        !isRecord(body) ||
        typeof body.code_challenge !== "string" ||
        typeof body.code_challenge_method !== "string"
      ) {
        return sendError("invalid", "pkce challenge is required");
      }
      const sources = parseGrants(body.sources ?? []);
      if (sources === null || typeof body.site_write !== "boolean") {
        return sendError("invalid", "grant is invalid");
      }
      const issued = await runtime.issueAuthCode(actor, {
        challenge: body.code_challenge,
        method: body.code_challenge_method,
        siteWrite: body.site_write,
        sources,
      });
      if (!issued.ok) {
        return sendError(issued.error, issued.message);
      }
      return sendJson({ code: issued.value.code });
    });
  }
}

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") {
    return {};
  }
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    return JSON.parse(text) as unknown;
  }
  const params = new URLSearchParams(text);
  const body: Record<string, unknown> = {};
  for (const [key, value] of params) {
    body[key] = value;
  }
  if (typeof body.sources === "string") {
    body.sources = JSON.parse(body.sources) as unknown;
  }
  if (body.site_write === "true") {
    body.site_write = true;
  }
  if (body.site_write === "false") {
    body.site_write = false;
  }
  return body;
}
