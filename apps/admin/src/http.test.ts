import { describe, expect, it } from "vitest";
import {
  AdminRequestError,
  browserTransport,
  createAdminClient,
  ParseError,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
} from "./http";

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function scripted(responses: readonly HttpResponse[]): {
  transport: HttpTransport;
  seen: HttpRequest[];
} {
  const seen: HttpRequest[] = [];
  const queue = [...responses];
  const transport: HttpTransport = (request) => {
    seen.push(request);
    const next = queue.shift();
    if (next === undefined)
      throw new Error(`missing response for ${request.method} ${request.path}`);
    return Promise.resolve(next);
  };
  return { transport, seen };
}

describe("admin http client", () => {
  it("logs in with the login field and reads the password gate", async () => {
    const { transport, seen } = scripted([{ status: 200, body: { must_change_password: true } }]);
    const result = await createAdminClient(transport).login("owner", "secret");
    expect(result).toEqual({ must_change_password: true });
    expect(seen).toEqual([
      { method: "POST", path: "/admin/login", json: { login: "owner", password: "secret" } },
    ]);
  });

  it("changes the password without a current password", async () => {
    const { transport, seen } = scripted([{ status: 200, body: { must_change_password: false } }]);
    await createAdminClient(transport).changePassword("next-secret");
    expect(seen[0]).toEqual({
      method: "POST",
      path: "/admin/password",
      json: { password: "next-secret" },
    });
  });

  it("surfaces password_change_required from the error body", async () => {
    const { transport } = scripted([
      {
        status: 403,
        body: { error: "password_change_required", message: "必须先改密" },
      },
    ]);
    await expect(createAdminClient(transport).whoami()).rejects.toMatchObject({
      status: 403,
      code: "password_change_required",
      message: "必须先改密",
    });
  });

  it("reads directories only from GET /pcp/v1/sources", async () => {
    const { transport, seen } = scripted([
      { status: 200, body: { sources: [{ id: "notes" }, { id: "work" }] } },
    ]);
    await expect(createAdminClient(transport).listSources()).resolves.toEqual([
      { id: "notes" },
      { id: "work" },
    ]);
    expect(seen[0]).toEqual({ method: "GET", path: "/pcp/v1/sources" });
  });

  it("approves an api key without business fields and returns the osk key once", async () => {
    const { transport, seen } = scripted([
      {
        status: 200,
        body: {
          id: "req_1",
          label: "laptop",
          unrestricted_data: false,
          site_write: true,
          sources: [{ id: "notes", read: true, write: false, visibility: false }],
          status: "pending",
          expires_at: "2026-05-21T00:15:00Z",
        },
      },
      { status: 200, body: { key: "osk_once" } },
    ]);
    const client = createAdminClient(transport);
    await expect(client.getApiKeyRequest("req 1")).resolves.toMatchObject({ label: "laptop" });
    await expect(client.approveApiKey("req 1")).resolves.toEqual({ key: "osk_once" });
    expect(seen[1]).toEqual({
      method: "POST",
      path: "/admin/api-keys/req%201/approve",
      json: {},
    });
  });

  it("rejects a key approval response that is not an osk key", async () => {
    const { transport } = scripted([{ status: 200, body: { key: "secret" } }]);
    await expect(createAdminClient(transport).approveApiKey("req_1")).rejects.toBeInstanceOf(
      ParseError,
    );
  });

  it("does not return an api key from device approval", async () => {
    const { transport, seen } = scripted([{ status: 200, body: { key: "osk_nope" } }]);
    const body = {
      user_code: "WDJB-MJHT",
      site_write: false,
      sources: [{ id: "notes", read: true, write: false, visibility: false }],
    };
    await expect(createAdminClient(transport).approveDevice(body)).rejects.toBeInstanceOf(
      ParseError,
    );
    expect(seen[0]).toEqual({ method: "POST", path: "/admin/device", json: body });
    expect(JSON.stringify(seen[0]?.json)).not.toContain("unrestricted_data");
  });

  it("posts the site decision and nothing else", async () => {
    const { transport, seen } = scripted([
      {
        status: 200,
        body: {
          id: "act_1",
          release_id: "rel_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          status: "pending",
          expires_at: "2026-05-21T00:15:00Z",
        },
      },
      { status: 200, body: null },
    ]);
    const client = createAdminClient(transport);
    await client.getSiteActivation("act_1");
    await client.decideSite("act_1", "reject");
    expect(seen[1]).toEqual({
      method: "POST",
      path: "/admin/site-activations/act_1/approve",
      json: { decision: "reject" },
    });
  });

  it("refuses key material on create", async () => {
    const { transport } = scripted([
      {
        status: 200,
        body: {
          id: "req_1",
          status: "pending",
          approval_url: "/admin/api-keys/req_1",
          expires_at: "2026-05-21T00:15:00Z",
          key: "osk_early",
        },
      },
    ]);
    await expect(
      createAdminClient(transport).createApiKey({
        label: "laptop",
        unrestricted_data: false,
        site_write: false,
        sources: [],
      }),
    ).rejects.toBeInstanceOf(ParseError);
  });

  it("sends the owner cookie on browser requests and sets origin by not overriding it", async () => {
    const calls: { input: string; init: RequestInit }[] = [];
    const fetchImpl: typeof fetch = (input, init) => {
      calls.push({ input: requestUrl(input), init: init ?? {} });
      return Promise.resolve(new Response(null, { status: 200 }));
    };
    await createAdminClient(browserTransport(fetchImpl)).logout();
    const call = calls[0];
    expect(call?.input).toBe("/admin/logout");
    expect(call?.init.credentials).toBe("include");
    expect(call?.init.method).toBe("POST");
    expect(new Headers(call?.init.headers).has("origin")).toBe(false);
    expect(call?.init.body).toBeUndefined();
  });

  it("uses only the documented error codes it was given", async () => {
    const { transport } = scripted([
      { status: 404, body: { error: "not_found", message: "没有这份申请" } },
    ]);
    const error = await createAdminClient(transport)
      .getApiKeyRequest("missing")
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AdminRequestError);
    expect(error).toMatchObject({ code: "not_found", message: "没有这份申请" });
  });
});

const activeKey = {
  id: "key_1",
  label: "laptop",
  unrestricted_data: false,
  site_write: true,
  sources: [{ id: "notes", read: true, write: false, visibility: false }],
  created_at: "2026-10-01T00:00:00Z",
  last_used_at: null,
  revoked_at: null,
};

const grant = {
  id: "grant_1",
  site_write: false,
  sources: [{ id: "notes", read: true, write: false, visibility: false }],
  created_at: "2026-10-01T00:00:00Z",
  revoked_at: null,
};

function browserCalls(body: unknown): {
  fetchImpl: typeof fetch;
  calls: { input: string; init: RequestInit }[];
} {
  const calls: { input: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    calls.push({ input: requestUrl(input), init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
  return { fetchImpl, calls };
}

describe("admin overview client", () => {
  it("reads the overview through the existing operations", async () => {
    const { transport, seen } = scripted([
      { status: 200, body: { api_keys: [activeKey] } },
      { status: 200, body: { id: "notes", page_count: 3, latest_write_at: null } },
      {
        status: 200,
        body: {
          pointer: { release_id: "public-page" },
          releases: [{ id: "rel_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", created_at: "2026-10-01" }],
        },
      },
      { status: 200, body: [{ source: "notes", slug: "a", type: "note", title: "A" }] },
      { status: 200, body: { oauth_grants: [grant] } },
    ]);
    const client = createAdminClient(transport);
    await expect(client.listApiKeys()).resolves.toEqual([activeKey]);
    await expect(client.sourceStatus("my notes")).resolves.toEqual({
      id: "notes",
      page_count: 3,
      latest_write_at: null,
    });
    await expect(client.listSites()).resolves.toEqual({
      pointer: "public-page",
      releases: [{ id: "rel_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", created_at: "2026-10-01" }],
    });
    await expect(client.listPublicPages()).resolves.toHaveLength(1);
    await expect(client.listOauthGrants()).resolves.toEqual([grant]);
    expect(seen).toEqual([
      { method: "GET", path: "/pcp/v1/api-keys" },
      { method: "GET", path: "/pcp/v1/sources/my%20notes" },
      { method: "GET", path: "/pcp/v1/site" },
      { method: "GET", path: "/pcp/v1/public/pages", anonymous: true },
      { method: "GET", path: "/admin/oauth-grants" },
    ]);
  });

  it("revokes an api key with DELETE and a grant with the existing POST route", async () => {
    const { transport, seen } = scripted([
      { status: 200, body: { id: "key_1" } },
      { status: 200, body: { id: "grant 1" } },
    ]);
    const client = createAdminClient(transport);
    await client.revokeApiKey("key_1");
    await client.revokeOauthGrant("grant 1");
    expect(seen).toEqual([
      { method: "DELETE", path: "/pcp/v1/api-keys/key_1" },
      { method: "POST", path: "/admin/oauth-grants/grant%201/revoke", json: {} },
    ]);
  });

  it("reads public pages without the owner cookie", async () => {
    const { fetchImpl, calls } = browserCalls([]);
    await createAdminClient(browserTransport(fetchImpl)).listPublicPages();
    expect(calls[0]?.input).toBe("/pcp/v1/public/pages");
    expect(calls[0]?.init.credentials).toBe("omit");
  });

  it("lists grants with the owner cookie and asks for JSON", async () => {
    const { fetchImpl, calls } = browserCalls({ oauth_grants: [] });
    await createAdminClient(browserTransport(fetchImpl)).listOauthGrants();
    expect(calls[0]?.input).toBe("/admin/oauth-grants");
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.credentials).toBe("include");
    expect(new Headers(calls[0]?.init.headers).get("accept")).toBe("application/json");
  });

  it("rejects key material anywhere in the overview responses", async () => {
    const cases: [
      HttpResponse,
      (client: ReturnType<typeof createAdminClient>) => Promise<unknown>,
    ][] = [
      [
        { status: 200, body: { api_keys: [{ ...activeKey, key: "osk_x" }] } },
        (c) => c.listApiKeys(),
      ],
      [{ status: 200, body: { id: "key_1", key: "osk_x" } }, (c) => c.revokeApiKey("key_1")],
      [
        { status: 200, body: { id: "notes", page_count: 1, latest_write_at: null, key: "x" } },
        (c) => c.sourceStatus("notes"),
      ],
      [
        { status: 200, body: { pointer: { release_id: "public-page" }, releases: [], key: "x" } },
        (c) => c.listSites(),
      ],
      [
        { status: 200, body: [{ source: "a", slug: "b", type: "c", title: "d", key: "x" }] },
        (c) => c.listPublicPages(),
      ],
      [
        { status: 200, body: { oauth_grants: [{ ...grant, key: "x" }] } },
        (c) => c.listOauthGrants(),
      ],
    ];
    for (const [response, call] of cases) {
      const { transport } = scripted([response]);
      await expect(call(createAdminClient(transport))).rejects.toBeInstanceOf(ParseError);
    }
  });

  it("rejects token-like fields and unknown shapes in the grant list", async () => {
    for (const extra of ["access_token", "refresh_token_payload", "refreshTokenHash", "hash"]) {
      const { transport } = scripted([
        { status: 200, body: { oauth_grants: [{ ...grant, [extra]: "x" }] } },
      ]);
      await expect(createAdminClient(transport).listOauthGrants()).rejects.toBeInstanceOf(
        ParseError,
      );
    }
    const missing: Record<string, unknown> = { ...grant };
    delete missing.revoked_at;
    for (const body of [
      { oauth_grants: [missing] },
      { oauth_grants: [{ ...grant, label: "laptop" }] },
      { oauth_grants: [{ ...grant, site_write: "no" }] },
      { grants: [] },
      [],
    ]) {
      const { transport } = scripted([{ status: 200, body }]);
      await expect(createAdminClient(transport).listOauthGrants()).rejects.toBeInstanceOf(
        ParseError,
      );
    }
  });

  it("rejects unknown shapes in the other overview responses", async () => {
    const cases: [unknown, (client: ReturnType<typeof createAdminClient>) => Promise<unknown>][] = [
      [{ keys: [] }, (c) => c.listApiKeys()],
      [{ api_keys: [{ ...activeKey, created_at: 1 }] }, (c) => c.listApiKeys()],
      [{ id: "notes", page_count: "3" }, (c) => c.sourceStatus("notes")],
      [{ pointer: "public-page", releases: [] }, (c) => c.listSites()],
      [{ pages: [] }, (c) => c.listPublicPages()],
    ];
    for (const [body, call] of cases) {
      const { transport } = scripted([{ status: 200, body }]);
      await expect(call(createAdminClient(transport))).rejects.toBeInstanceOf(ParseError);
    }
  });
});
