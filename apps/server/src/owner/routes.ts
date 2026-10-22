import type { Hono } from "hono";

import { isRecord, parseGrants, rateLimited, readJson, sendError, sendJson } from "../app/json.ts";
import { parseOperation } from "../app/schemas.ts";
import type { Runtime } from "../app/runtime.ts";
import { adminPage, wantsJson } from "./static.ts";

export function mountOwner(app: Hono, runtime: Runtime): void {
  app.post("/admin/login", async (c) => {
    if (!originAllowed(c.req.raw, runtime.origin)) {
      return sendError("forbidden", "origin is not allowed");
    }
    if (!(await runtime.allow("login", runtime.clientAddress(c.req.raw)))) {
      return rateLimited();
    }
    const body = parseOperation("login", await readBody(c.req.raw));
    if (body === null) {
      return sendError("invalid", "login is invalid");
    }
    const result = await runtime.login(body.login, body.password);
    if (!result.ok) {
      return sendError(result.error, result.message);
    }
    return sendJson(
      { must_change_password: result.value.must_change_password },
      200,
      new Headers({
        "set-cookie": sessionCookie(result.value.sessionId, runtime.origin.startsWith("https://")),
      }),
    );
  });

  app.post("/admin/password", async (c) => {
    if (!originAllowed(c.req.raw, runtime.origin)) {
      return sendError("forbidden", "origin is not allowed");
    }
    const actor = await runtime.authenticate(c.req.raw);
    const body = parseOperation("password", await readBody(c.req.raw));
    if (body === null) {
      return sendError("invalid", "password is required");
    }
    const result = await runtime.changePassword(actor, body.password);
    if (!result.ok) {
      return sendError(result.error, result.message);
    }
    return sendJson({ must_change_password: false });
  });

  app.post("/admin/logout", async (c) => {
    if (!originAllowed(c.req.raw, runtime.origin)) {
      return sendError("forbidden", "origin is not allowed");
    }
    const actor = await runtime.authenticate(c.req.raw);
    await runtime.logout(actor);
    const headers = new Headers({
      "set-cookie": clearCookie(runtime.origin.startsWith("https://")),
    });
    return sendJson({}, 200, headers);
  });

  app.get("/admin/api-keys/:id", async (c) => {
    if (!wantsJson(c.req.raw)) {
      return adminPage(runtime, c);
    }
    const actor = await runtime.authenticate(c.req.raw);
    const result = await runtime.getApiKeyRequest(actor, c.req.param("id"));
    if (!result.ok) {
      return sendError(result.error, result.message);
    }
    return sendJson(result.value);
  });

  app.post("/admin/api-keys/:id/approve", async (c) => {
    if (!originAllowed(c.req.raw, runtime.origin)) {
      return sendError("forbidden", "origin is not allowed");
    }
    const actor = await runtime.authenticate(c.req.raw);
    const result = await runtime.approveApiKey(actor, c.req.param("id"));
    if (!result.ok) {
      return sendError(result.error, result.message);
    }
    return sendJson({ key: result.value.key });
  });

  app.get("/admin/site-activations/:id", async (c) => {
    if (!wantsJson(c.req.raw)) {
      return adminPage(runtime, c);
    }
    const actor = await runtime.authenticate(c.req.raw);
    const result = await runtime.getActivation(actor, c.req.param("id"));
    if (!result.ok) {
      return sendError(result.error, result.message);
    }
    return sendJson(result.value);
  });

  app.post("/admin/site-activations/:id/approve", async (c) => {
    if (!originAllowed(c.req.raw, runtime.origin)) {
      return sendError("forbidden", "origin is not allowed");
    }
    const actor = await runtime.authenticate(c.req.raw);
    const body = await readBody(c.req.raw);
    if (!isRecord(body) || (body.decision !== "approve" && body.decision !== "reject")) {
      return sendError("invalid", "decision is invalid");
    }
    const result = await runtime.decideActivation(actor, c.req.param("id"), body.decision);
    if (!result.ok) {
      return sendError(result.error, result.message);
    }
    return sendJson(result.value);
  });

  app.post("/admin/device", async (c) => {
    if (!originAllowed(c.req.raw, runtime.origin)) {
      return sendError("forbidden", "origin is not allowed");
    }
    const actor = await runtime.authenticate(c.req.raw);
    const body = await readBody(c.req.raw);
    if (!isRecord(body) || "unrestricted_data" in body) {
      return sendError("invalid", "device approval is invalid");
    }
    const approved = parseOperation("device_approval", body);
    if (approved === null) {
      return sendError("invalid", "device approval is invalid");
    }
    const sources = parseGrants(approved.sources);
    if (sources === null) {
      return sendError("invalid", "sources are invalid");
    }
    const result = await runtime.approveDevice(actor, {
      userCode: approved.user_code,
      siteWrite: approved.site_write,
      sources,
    });
    if (!result.ok) {
      return sendError(result.error, result.message);
    }
    return sendJson({});
  });

  app.post("/admin/oauth-grants/:id/revoke", async (c) => {
    if (!originAllowed(c.req.raw, runtime.origin)) {
      return sendError("forbidden", "origin is not allowed");
    }
    const actor = await runtime.authenticate(c.req.raw);
    const result = await runtime.revokeOauthGrant(actor, c.req.param("id"));
    if (!result.ok) {
      return sendError(result.error, result.message);
    }
    return sendJson(result.value);
  });
}

function originAllowed(request: Request, origin: string): boolean {
  return request.headers.get("origin") === origin;
}

function sessionCookie(id: string, secure: boolean): string {
  const parts = [`oneself_session=${id}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function clearCookie(secure: boolean): string {
  const parts = ["oneself_session=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await readJson(request);
  } catch {
    return null;
  }
}
