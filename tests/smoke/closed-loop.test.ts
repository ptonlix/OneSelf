import { openPostgres, openS3ObjectStore } from "../../packages/adapters/src/index.js";
import {
  prepareSmokeBucket,
  prepareSmokeDatabase,
} from "../../packages/adapters/src/smoke-resources.js";
import { afterEach, beforeEach, expect, it } from "vitest";

import { writeStoredZip } from "../../apps/server/src/app/zip.js";
import { createServer, type ServerHandle } from "../../apps/server/src/index.js";
import { migrationStatements, smokeEnvironment } from "./smoke-env.js";
import { issueApiKey } from "./support.js";

// Runs against the dev services that are already up (docker compose -f compose.dev.yaml up -d),
// in its own database (default oneself_smoke) and bucket (default oneself-smoke). It starts no
// containers. Each test resets that database and bucket, then leaves them in place.

const ORIGIN = "http://127.0.0.1:3000";

let server: ServerHandle | undefined;

beforeEach(async () => {
  const smoke = smokeEnvironment();
  await prepareSmokeDatabase({
    adminUrl: smoke.adminUrl,
    databaseUrl: smoke.databaseUrl,
    database: smoke.database,
    statements: migrationStatements("packages/db/migrations"),
  });
  await prepareSmokeBucket(smoke.objectStorage);
  server = await openSmokeServer();
}, 60_000);

afterEach(async () => {
  await server?.close();
  server = undefined;
}, 60_000);

function openSmokeServer(): Promise<ServerHandle> {
  const smoke = smokeEnvironment();
  return createServer({
    publicOrigin: ORIGIN,
    ownerLogin: "owner",
    ownerPassword: "initial-password",
    postgres: openPostgres(smoke.databaseUrl),
    objectStore: openS3ObjectStore(smoke.objectStorage),
  });
}

it("publishes a page through the original site, then hides it", async () => {
  if (server === undefined) {
    throw new Error("server was not started");
  }
  const cookie = await login();
  await changePassword(cookie);
  const source = "loop";
  const created = await server.request("/pcp/v1/sources", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ id: source }),
  });
  expect([200, 409]).toContain(created.status);
  const slug = `note-${Date.now().toString(36)}`;
  const markdown = `---\ntype: note\ntitle: Closed Loop\nvisibility: public\n---\n\nvisible-body\n`;
  const written = await server.request(`/pcp/v1/pages/${source}/${slug}`, {
    method: "PUT",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ markdown }),
  });
  expect(written.status, await written.clone().text()).toBe(200);

  const home = await server.request("/");
  expect(home.status).toBe(200);
  expect(await home.text()).toContain("OneSelf");
  const published = await server.request(`/pcp/v1/public/pages/${source}/${slug}`);
  expect(published.status).toBe(200);
  expect(published.headers.get("cache-control")).toBe("no-store");
  expect(await published.text()).toContain("visible-body");

  const archive = writeStoredZip([
    { path: "index.html", data: new TextEncoder().encode("RELEASE-MARKER") },
  ]);
  const body = new FormData();
  body.set("archive", new File([archive], "site.zip", { type: "application/zip" }));
  const uploaded = await server.request("/pcp/v1/site/releases", {
    method: "POST",
    headers: { cookie, origin: ORIGIN },
    body,
  });
  expect(uploaded.status, await uploaded.clone().text()).toBe(200);
  const releaseId = ((await uploaded.json()) as { id: string }).id;
  expect(await (await server.request("/")).text()).not.toContain("RELEASE-MARKER");
  const activation = (await (
    await server.request("/pcp/v1/site/activate", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ release_id: releaseId }),
    })
  ).json()) as { id: string };
  expect(await (await server.request("/")).text()).not.toContain("RELEASE-MARKER");
  const approved = await server.request(`/admin/site-activations/${activation.id}/approve`, {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ decision: "approve" }),
  });
  expect(approved.status).toBe(200);
  expect(await (await server.request("/")).text()).toContain("RELEASE-MARKER");

  const hidden = await server.request(`/pcp/v1/pages/${source}/${slug}`, {
    method: "PUT",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({
      markdown: markdown.replace("visibility: public", "visibility: private"),
    }),
  });
  expect(hidden.status, await hidden.clone().text()).toBe(200);
  const gone = await server.request(`/pcp/v1/public/pages/${source}/${slug}`);
  expect(gone.status).toBe(404);
}, 60_000);

it("finds a stored page through postgres search", async () => {
  const cookie = await ownerSession();
  const source = "search";
  const slug = "note";
  const token = "postgres-search-token";
  await putSource(cookie, source);
  const written = await started().request(`/pcp/v1/pages/${source}/${slug}`, {
    method: "PUT",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({
      markdown: `---\ntype: note\ntitle: Searchable\nvisibility: private\n---\n\n${token}\n`,
    }),
  });
  expect(written.status, await written.clone().text()).toBe(200);

  const found = await started().request("/pcp/v1/search", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ q: token }),
  });
  expect(found.status, await found.clone().text()).toBe(200);
  const hits = (await found.json()) as {
    source: string;
    slug: string;
    type: string;
    title: string;
    snippet: string;
  }[];
  expect(hits).toHaveLength(1);
  expect(hits[0]).toMatchObject({ source, slug, type: "note", title: "Searchable" });
  expect(hits[0]?.snippet).toContain(token);

  const hidden = await started().request("/pcp/v1/public/search", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ q: token }),
  });
  expect(hidden.status, await hidden.clone().text()).toBe(200);
  expect(await hidden.json()).toEqual([]);
}, 60_000);

it("reloads the page and api key after the server restarts", async () => {
  const cookie = await ownerSession();
  const source = "reload";
  const slug = "note";
  const token = "reloaded-page-token";
  const markdown = `---\ntype: note\ntitle: Reloaded\nvisibility: private\n---\n\n${token}\n`;
  await putSource(cookie, source);
  const written = await started().request(`/pcp/v1/pages/${source}/${slug}`, {
    method: "PUT",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ markdown }),
  });
  expect(written.status, await written.clone().text()).toBe(200);
  const issued = await issueApiKey(started(), cookie, {
    label: "reload-reader",
    sources: [{ id: source, read: true, write: false, visibility: false }],
  });

  await server?.close();
  server = await openSmokeServer();

  const stale = await started().request("/pcp/v1/whoami", { headers: { cookie } });
  expect(stale.status).toBe(401);
  const oldPassword = await started().request("/admin/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ login: "owner", password: "initial-password" }),
  });
  expect(oldPassword.status).toBe(401);

  const again = await login("new-password");
  const page = await started().request(`/pcp/v1/pages/${source}/${slug}`, {
    headers: { cookie: again },
  });
  expect(page.status, await page.clone().text()).toBe(200);
  expect(await page.json()).toMatchObject({ markdown, visibility: "private" });

  const byKey = await started().request(`/pcp/v1/pages/${source}/${slug}`, {
    headers: { authorization: `ApiKey ${issued.key}` },
  });
  expect(byKey.status, await byKey.clone().text()).toBe(200);
  expect(await byKey.json()).toMatchObject({ markdown });
}, 60_000);

function jsonHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({ origin: ORIGIN, "content-type": "application/json", ...extra });
}

function started(): ServerHandle {
  if (server === undefined) {
    throw new Error("server was not started");
  }
  return server;
}

async function ownerSession(): Promise<string> {
  const cookie = await login();
  await changePassword(cookie);
  return cookie;
}

async function putSource(cookie: string, id: string): Promise<void> {
  const created = await started().request("/pcp/v1/sources", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ id }),
  });
  expect(created.status, await created.clone().text()).toBe(200);
}

async function login(password = "initial-password"): Promise<string> {
  const response = await started().request("/admin/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ login: "owner", password }),
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

async function changePassword(cookie: string): Promise<void> {
  const response = await started().request("/admin/password", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ password: "new-password" }),
  });
  expect(response.status, await response.clone().text()).toBe(200);
}
