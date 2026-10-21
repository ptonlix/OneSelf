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

import { ManualClock, SystemClock } from "./app/clock.js";
import {
  openRuntime,
  StartupRefused,
  type IngressMode,
  type Runtime,
  type ServerOptions,
} from "./app/runtime.js";
import { mountMcp } from "./mcp/routes.js";
import { mountOauth } from "./oauth/routes.js";
import { mountOwner } from "./owner/routes.js";
import { mountPcp } from "./pcp/routes.js";
import { mountSiteFiles } from "./site-files/routes.js";

export type { IngressMode };

export type CreateServerOptions = Partial<
  Omit<ServerOptions, "objectStore" | "skillsDir" | "originalPagesDir">
> & {
  readonly objectStore?: ServerOptions["objectStore"];
  readonly skillsDir?: string;
  readonly originalPagesDir?: string;
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
      originalPagesDir: options.originalPagesDir ?? path.join(root, "packages", "original-pages"),
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
    },
    objectStore,
  );
  const app = new Hono();
  mountPcp(app, runtime);
  mountMcp(app, runtime);
  mountOauth(app, runtime);
  mountOwner(app, runtime);
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

async function listen(): Promise<void> {
  const clock = new SystemClock();
  const endpoint = env("OBJECT_STORAGE_ENDPOINT");
  const objectStore =
    endpoint === undefined
      ? memoryObjectStore(clock)
      : openS3ObjectStore({
          endpoint,
          region: env("OBJECT_STORAGE_REGION") ?? "us-east-1",
          bucket: env("OBJECT_STORAGE_BUCKET") ?? "oneself",
          accessKeyId: env("OBJECT_STORAGE_ACCESS_KEY") ?? env("RUSTFS_ACCESS_KEY") ?? "",
          secretAccessKey: env("OBJECT_STORAGE_SECRET_KEY") ?? env("RUSTFS_SECRET_KEY") ?? "",
        });
  const databaseUrl = env("DATABASE_URL");
  const postgres = databaseUrl === undefined ? undefined : openPostgres(databaseUrl);
  const publicOrigin = env("PUBLIC_ORIGIN");
  const ownerLogin = env("OWNER_LOGIN");
  const ownerPassword = env("OWNER_PASSWORD");
  const ownerResetPassword = env("OWNER_RESET_PASSWORD");
  const server = await createServer({
    ingress: readIngress(env("COMPOSE_PROFILES")),
    oauthAuthorizationCode: env("OAUTH_TEST_AUTHORIZATION_CODE") === "1",
    clock,
    objectStore,
    ...(postgres === undefined ? {} : { postgres }),
    ...(publicOrigin === undefined ? {} : { publicOrigin }),
    ...(ownerLogin === undefined ? {} : { ownerLogin }),
    ...(ownerPassword === undefined ? {} : { ownerPassword }),
    ...(ownerResetPassword === undefined ? {} : { ownerResetPassword }),
  });
  const port = Number(env("PORT") ?? "3000");
  const httpServer = createHttpServer((request, response) => {
    void forward(server, request, response);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, "127.0.0.1", () => {
        resolve();
      });
    });
  } catch (error) {
    await server.close();
    throw error;
  }
  console.info(`oneself listening on ${String(port)}`);
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
