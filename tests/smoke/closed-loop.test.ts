import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { openPostgres, openS3ObjectStore } from "../../packages/adapters/src/index.js";
import { afterAll, beforeAll, expect, it } from "vitest";

import { writeStoredZip } from "../../apps/server/src/app/zip.js";
import { createServer, type ServerHandle } from "../../apps/server/src/index.js";

const ORIGIN = "http://127.0.0.1:3000";
const DATABASE_URL = "postgres://oneself:oneself@127.0.0.1:5432/oneself";
const composeArgs = ["compose", "-p", "oneself-smoke", "-f", "compose.dev.yaml"];

let server: ServerHandle | undefined;

beforeAll(async () => {
  execFileSync("docker", [...composeArgs, "up", "-d", "--wait"], {
    stdio: "inherit",
  });
  const sql = [
    "drop schema if exists public cascade;",
    "create schema public;",
    readFileSync("packages/db/migrations/0000_initial.sql", "utf8").replaceAll(
      "--> statement-breakpoint",
      "",
    ),
  ].join("\n");
  execFileSync(
    "docker",
    [
      ...composeArgs,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "oneself",
      "-d",
      "oneself",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql },
  );
  server = await createServer({
    publicOrigin: ORIGIN,
    ownerLogin: "owner",
    ownerPassword: "initial-password",
    postgres: openPostgres(DATABASE_URL),
    objectStore: openS3ObjectStore({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      bucket: "oneself",
      accessKeyId: "oneself",
      secretAccessKey: "oneselfsecret",
    }),
  });
}, 180_000);

afterAll(async () => {
  await server?.close();
  execFileSync("docker", [...composeArgs, "down"], { stdio: "inherit" });
});

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
}, 120_000);

function jsonHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({ origin: ORIGIN, "content-type": "application/json", ...extra });
}

function started(): ServerHandle {
  if (server === undefined) {
    throw new Error("server was not started");
  }
  return server;
}

async function login(): Promise<string> {
  const response = await started().request("/admin/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ login: "owner", password: "initial-password" }),
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
