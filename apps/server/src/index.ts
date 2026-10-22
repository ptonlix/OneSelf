import { existsSync } from "node:fs";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { openPostgres, openS3ObjectStore } from "@oneself/adapters";
import { memoryObjectStore } from "@oneself/adapters/testing";
import { Hono } from "hono";

import { ManualClock, SystemClock } from "./app/clock.ts";
import {
  openRuntime,
  StartupRefused,
  type IngressMode,
  type Runtime,
  type ServerOptions,
} from "./app/runtime.ts";
import { mountMcp } from "./mcp/routes.ts";
import { mountOauth } from "./oauth/routes.ts";
import { mountOwner } from "./owner/routes.ts";
import { mountAdminPages } from "./owner/static.ts";
import { mountPcp } from "./pcp/routes.ts";
import { mountSiteFiles } from "./site-files/routes.ts";

export type { IngressMode };

export type CreateServerOptions = Partial<
  Omit<ServerOptions, "objectStore" | "skillsDir" | "publicPageDir" | "adminDistDir">
> & {
  readonly objectStore?: ServerOptions["objectStore"];
  readonly skillsDir?: string;
  readonly publicPageDir?: string;
  readonly adminDistDir?: string;
};

export type ServerHandle = {
  request: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  runtime: Runtime;
  clock: ManualClock;
  maintain: () => Promise<void>;
  close: () => Promise<void>;
};

export async function createServer(options: CreateServerOptions = {}): Promise<ServerHandle> {
  const clock = options.clock ?? new ManualClock();
  const objectStore = options.objectStore ?? memoryObjectStore(clock);
  const root = repoRoot();
  const runtime = await openRuntime(
    {
      clock,
      skillsDir: options.skillsDir ?? path.join(root, "skills"),
      publicPageDir: options.publicPageDir ?? path.join(root, "packages", "public-page"),
      adminDistDir: options.adminDistDir ?? path.join(root, "apps", "admin", "dist"),
      ...(options.publicOrigin === undefined ? {} : { publicOrigin: options.publicOrigin }),
      ...(options.ownerLogin === undefined ? {} : { ownerLogin: options.ownerLogin }),
      ...(options.ownerPassword === undefined ? {} : { ownerPassword: options.ownerPassword }),
      ...(options.ownerResetPassword === undefined
        ? {}
        : { ownerResetPassword: options.ownerResetPassword }),
      ...(options.ingress === undefined ? {} : { ingress: options.ingress }),
      ...(options.oauthAuthorizationCode === undefined
        ? {}
        : { oauthAuthorizationCode: options.oauthAuthorizationCode }),
      ...(options.log === undefined ? {} : { log: options.log }),
      ...(options.postgres === undefined ? {} : { postgres: options.postgres }),
      ...(options.seedGrants === undefined ? {} : { seedGrants: options.seedGrants }),
    },
    objectStore,
  );
  const app = new Hono();
  mountPcp(app, runtime);
  mountMcp(app, runtime);
  mountOauth(app, runtime);
  mountOwner(app, runtime);
  mountAdminPages(app, runtime);
  mountSiteFiles(app, runtime);
  const timer = setInterval(
    () => {
      void runtime.maintain();
    },
    60 * 60 * 1000,
  );
  timer.unref();
  return {
    request: (input, init) => Promise.resolve(app.request(input, init)),
    runtime,
    clock,
    maintain: () => runtime.maintain(),
    close: () => {
      clearInterval(timer);
      return runtime.close();
    },
  };
}

function repoRoot(): string {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  void listen().catch((error: unknown) => {
    if (error instanceof StartupRefused) {
      console.error("owner is not configured");
    } else if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("server failed to start");
    }
    process.exit(1);
  });
}

export function resolveListenHost(value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    return "127.0.0.1";
  }
  return value;
}

export function listenUrls(input: { host: string; port: number; publicOrigin?: string }): {
  site: string;
  admin: string;
} {
  const origin = (input.publicOrigin ?? localOrigin(input.host, input.port)).replace(/\/$/, "");
  return { site: origin, admin: `${origin}/admin` };
}

function localOrigin(host: string, port: number): string {
  const visible = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  const hostname = visible.includes(":") ? `[${visible}]` : visible;
  return `http://${hostname}:${String(port)}`;
}

export function assertDirectStart(
  env: NodeJS.ProcessEnv,
  paths: {
    publicPageDist: string;
    adminDist: string;
  },
): void {
  const required = [
    "DATABASE_URL",
    "OBJECT_STORAGE_ENDPOINT",
    "OBJECT_STORAGE_ACCESS_KEY",
    "OBJECT_STORAGE_SECRET_KEY",
  ] as const;
  for (const name of required) {
    const value = env[name];
    if (value === undefined || value.length === 0) {
      throw new Error(`${name} is required`);
    }
  }
  if (!existsSync(path.join(paths.publicPageDist, "index.html"))) {
    throw new Error("public page dist is missing");
  }
  if (!existsSync(path.join(paths.adminDist, "index.html"))) {
    throw new Error("admin dist is missing");
  }
}

async function listen(): Promise<void> {
  const root = repoRoot();
  const publicPageDir = path.join(root, "packages", "public-page");
  const adminDistDir = path.join(root, "apps", "admin", "dist");
  assertDirectStart(process.env, {
    publicPageDist: path.join(publicPageDir, "dist"),
    adminDist: adminDistDir,
  });
  const clock = new SystemClock();
  const endpoint = env("OBJECT_STORAGE_ENDPOINT");
  const accessKeyId = env("OBJECT_STORAGE_ACCESS_KEY");
  const secretAccessKey = env("OBJECT_STORAGE_SECRET_KEY");
  if (endpoint === undefined || accessKeyId === undefined || secretAccessKey === undefined) {
    throw new Error("object storage is not configured");
  }
  const objectStore = openS3ObjectStore({
    endpoint,
    region: env("OBJECT_STORAGE_REGION") ?? "us-east-1",
    bucket: env("OBJECT_STORAGE_BUCKET") ?? "oneself",
    accessKeyId,
    secretAccessKey,
  });
  const databaseUrl = env("DATABASE_URL");
  if (databaseUrl === undefined) {
    throw new Error("DATABASE_URL is required");
  }
  const postgres = openPostgres(databaseUrl);
  const publicOrigin = env("PUBLIC_ORIGIN");
  const ownerLogin = env("OWNER_LOGIN");
  const ownerPassword = env("OWNER_PASSWORD");
  const ownerResetPassword = env("OWNER_RESET_PASSWORD");
  const server = await createServer({
    ingress: readIngress(env("COMPOSE_PROFILES")),
    oauthAuthorizationCode: env("OAUTH_TEST_AUTHORIZATION_CODE") === "1",
    clock,
    objectStore,
    publicPageDir,
    adminDistDir,
    postgres,
    ...(publicOrigin === undefined ? {} : { publicOrigin }),
    ...(ownerLogin === undefined ? {} : { ownerLogin }),
    ...(ownerPassword === undefined ? {} : { ownerPassword }),
    ...(ownerResetPassword === undefined ? {} : { ownerResetPassword }),
  });
  const port = Number(env("PORT") ?? "3000");
  const host = resolveListenHost(env("HOST"));
  const httpServer = createHttpServer((request, response) => {
    void forward(server, request, response);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, host, () => {
        resolve();
      });
    });
  } catch (error) {
    await server.close();
    throw error;
  }
  const urls = listenUrls({ host, port, ...(publicOrigin === undefined ? {} : { publicOrigin }) });
  console.info(`oneself listening\n${urls.site}\n${urls.admin}`);
}

async function forward(
  server: ServerHandle,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const host = request.headers.host ?? "127.0.0.1";
  const url = `http://${host}${request.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === "string") {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    }
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(chunkBytes(chunk));
  }
  const method = request.method ?? "GET";
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = concatBytes(chunks);
  }
  const result = await server.request(url, init);
  response.statusCode = result.status;
  result.headers.forEach((value, key) => {
    response.setHeader(key, value);
  });
  response.end(Buffer.from(await result.arrayBuffer()));
}

function readIngress(value: string | undefined): IngressMode {
  if (value === "cloudflared" || value === "caddy" || value === "tailscale") {
    return value;
  }
  return "none";
}

function chunkBytes(chunk: unknown): Uint8Array {
  if (typeof chunk === "string") {
    return new TextEncoder().encode(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  return new Uint8Array();
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}
