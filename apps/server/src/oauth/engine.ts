import { generateKeyPairSync, type JsonWebKey } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import Provider from "oidc-provider";
import type { SourceGrant } from "@oneself/domain";

import { sha256Hex } from "../app/ids.ts";

const CLIENT_ID = "oneself";
const ACCOUNT_ID = "owner";
const DEVICE_TTL_SECONDS = 15 * 60;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export type PersistedGrant = {
  id: string;
  siteWrite: boolean;
  sources: SourceGrant[];
  refreshTokenHash: string | null;
  rotatedRefreshHashes: string[];
  refreshTokenPayload: Record<string, unknown> | null;
  revokedAt: string | null;
  createdAt: string;
};

export type GrantPatch = {
  refreshTokenHash?: string | null;
  rotatedRefreshHashes?: string[];
  refreshTokenPayload?: Record<string, unknown> | null;
  revokedAt?: string | null;
};

type TokenPayload = Record<string, unknown>;

type DeviceCodeRecord = {
  accountId?: string;
  error?: string;
  isExpired: boolean;
  grantId?: string;
  scope?: string;
  save(): Promise<string>;
};

type AccessTokenRecord = {
  grantId?: string;
  isExpired: boolean;
};

type ProviderModels = {
  callback(): (req: IncomingMessage, res: ServerResponse) => void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  DeviceCode: {
    findByUserCode(
      userCode: string,
      options?: { ignoreExpiration?: boolean },
    ): Promise<DeviceCodeRecord | undefined>;
  };
  Grant: new (payload: Record<string, unknown>) => { save(): Promise<string> };
  AccessToken: {
    find(token: string): Promise<AccessTokenRecord | undefined>;
  };
  AuthorizationCode: new (payload: Record<string, unknown>) => { save(): Promise<string> };
};

type StoredModel = {
  payload: TokenPayload;
  expiresAt: number;
  grantId: string | null;
  userCode: string | null;
};

export type OauthEngine = {
  handle(request: Request, path: "/device/auth" | "/token"): Promise<Response>;
  approveDevice(
    userCode: string,
    input: { siteWrite: boolean; sources: SourceGrant[] },
  ): Promise<"ok" | "not_found" | "expired" | "used">;
  issueAuthCode(input: {
    challenge: string;
    method: string;
    siteWrite: boolean;
    sources: SourceGrant[];
  }): Promise<{ code: string }>;
  grantForAccessToken(token: string): Promise<PersistedGrant | null>;
  revoke(id: string): Promise<boolean>;
  sweep(nowMs: number): void;
  /** Deletes one refresh adapter row. Reuse still revokes from rotated hashes. */
  dropRefreshAdapter(token: string): void;
  close(): Promise<void>;
};

type EngineOptions = {
  readonly origin: string;
  readonly authorizationCode: boolean;
  readonly grants: readonly PersistedGrant[];
  readonly now: () => string;
  readonly insertGrant: (grant: PersistedGrant) => Promise<void>;
  readonly updateGrant: (id: string, patch: GrantPatch) => Promise<void>;
};

let signingKeys: { keys: JsonWebKey[] } | undefined;

export async function createOauthEngine(options: EngineOptions): Promise<OauthEngine> {
  const grants = new Map(options.grants.map((grant) => [grant.id, cloneGrant(grant)]));
  const memory = new Map<string, Map<string, StoredModel>>();
  const userCodes = new Map<string, string>();
  const adapter = createAdapter(memory, userCodes, grants, options);
  seed(memory, grants);
  const redirectUri = `${options.origin}/oauth/callback`;
  const provider = new Provider(options.origin, {
    adapter,
    clients: [
      {
        client_id: CLIENT_ID,
        token_endpoint_auth_method: "none",
        grant_types: options.authorizationCode
          ? ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token", "authorization_code"]
          : ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
        response_types: options.authorizationCode ? ["code"] : [],
        redirect_uris: options.authorizationCode ? [redirectUri] : [],
      },
    ],
    features: {
      deviceFlow: { enabled: true },
      devInteractions: { enabled: false },
      revocation: { enabled: true },
    },
    ttl: {
      AccessToken: ACCESS_TTL_SECONDS,
      AuthorizationCode: ACCESS_TTL_SECONDS,
      DeviceCode: DEVICE_TTL_SECONDS,
      Grant: REFRESH_TTL_SECONDS,
      RefreshToken: REFRESH_TTL_SECONDS,
    },
    issueRefreshToken: () => true,
    rotateRefreshToken: true,
    pkce: {
      required: (ctx: { oidc?: { route?: string } }) =>
        options.authorizationCode && ctx.oidc?.route === "authorization",
    },
    jwks: signingJwks(),
    findAccount: (_ctx: unknown, id: string) => ({
      accountId: id,
      claims() {
        return Promise.resolve({ sub: id });
      },
    }),
  }) as unknown as ProviderModels;
  provider.on("grant.revoked", (_ctx: unknown, grantId: unknown) => {
    if (typeof grantId !== "string") {
      return;
    }
    void markRevoked(grants, grantId, options);
  });
  const server = createServer(provider.callback());
  await listen(server);
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  return {
    async handle(request, path) {
      sweepMaps(memory, userCodes, Date.now());
      const params = await formParams(request);
      if (!params.has("client_id")) {
        params.set("client_id", CLIENT_ID);
      }
      const grantType = params.get("grant_type");
      if (grantType === "password" || grantType === "implicit") {
        return oauthJson(400, {
          error: "unsupported_grant_type",
          error_description: "grant type is not supported",
          message: "grant type is not supported",
        });
      }
      if (grantType === "authorization_code" && !options.authorizationCode) {
        return oauthJson(400, {
          error: "unsupported_grant_type",
          error_description: "authorization code is not enabled",
          message: "authorization code is not enabled",
        });
      }
      if (grantType === "authorization_code" && !params.has("redirect_uri")) {
        params.set("redirect_uri", redirectUri);
      }
      if (path === "/token") {
        const reused = await revokeRotatedRefresh(params, grants, memory, options);
        if (reused !== undefined) {
          return reused;
        }
      }
      const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          host: new URL(options.origin).host,
        },
        body: params,
      });
      const body = (await response.json()) as Record<string, unknown>;
      if (
        path === "/device/auth" &&
        response.status === 200 &&
        typeof body.user_code === "string"
      ) {
        body.verification_uri = `${options.origin}/admin/device`;
        body.verification_uri_complete = `${options.origin}/admin/device?user_code=${encodeURIComponent(body.user_code)}`;
        body.interval = 5;
      }
      if (typeof body.error_description === "string" && typeof body.message !== "string") {
        body.message = body.error_description;
      }
      return oauthJson(response.status, body);
    },
    async approveDevice(userCode, input) {
      const code = await provider.DeviceCode.findByUserCode(normalizeUserCode(userCode), {
        ignoreExpiration: true,
      });
      if (code === undefined) {
        return "not_found";
      }
      if (code.isExpired) {
        return "expired";
      }
      if (code.accountId !== undefined || code.error !== undefined) {
        return "used";
      }
      const grant = new provider.Grant({ accountId: ACCOUNT_ID, clientId: CLIENT_ID });
      const id = await grant.save();
      code.accountId = ACCOUNT_ID;
      code.grantId = id;
      code.scope = "offline_access";
      await code.save();
      const record: PersistedGrant = {
        id,
        siteWrite: input.siteWrite,
        sources: input.sources.map((source) => ({ ...source })),
        refreshTokenHash: null,
        rotatedRefreshHashes: [],
        refreshTokenPayload: null,
        revokedAt: null,
        createdAt: options.now(),
      };
      grants.set(id, record);
      await options.insertGrant(record);
      return "ok";
    },
    async issueAuthCode(input) {
      const grant = new provider.Grant({ accountId: ACCOUNT_ID, clientId: CLIENT_ID });
      const id = await grant.save();
      const code = new provider.AuthorizationCode({
        accountId: ACCOUNT_ID,
        clientId: CLIENT_ID,
        grantId: id,
        scope: "offline_access",
        codeChallenge: input.challenge,
        codeChallengeMethod: input.method,
        redirectUri,
      });
      const value = await code.save();
      const record: PersistedGrant = {
        id,
        siteWrite: input.siteWrite,
        sources: input.sources.map((source) => ({ ...source })),
        refreshTokenHash: null,
        rotatedRefreshHashes: [],
        refreshTokenPayload: null,
        revokedAt: null,
        createdAt: options.now(),
      };
      grants.set(id, record);
      await options.insertGrant(record);
      return { code: value };
    },
    async grantForAccessToken(token) {
      const found = await provider.AccessToken.find(token);
      if (found === undefined || found.isExpired || found.grantId === undefined) {
        return null;
      }
      const grant = grants.get(found.grantId);
      if (grant === undefined || grant.revokedAt !== null) {
        return null;
      }
      return grant;
    },
    async revoke(id) {
      const grant = grants.get(id);
      if (grant === undefined || grant.revokedAt !== null) {
        return false;
      }
      await markRevoked(grants, id, options);
      destroyGrantTokens(memory, id);
      return true;
    },
    sweep(nowMs) {
      sweepMaps(memory, userCodes, nowMs);
    },
    dropRefreshAdapter(token) {
      bucketFor(memory, "RefreshToken").delete(sha256Hex(token));
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error instanceof Error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function createAdapter(
  memory: Map<string, Map<string, StoredModel>>,
  userCodes: Map<string, string>,
  grants: Map<string, PersistedGrant>,
  options: EngineOptions,
) {
  return class OneselfAdapter {
    readonly name: string;

    constructor(name: string) {
      this.name = name;
      if (!memory.has(name)) {
        memory.set(name, new Map());
      }
    }

    async upsert(id: string, payload: TokenPayload, expiresIn: number): Promise<void> {
      const bucket = bucketFor(memory, this.name);
      const grantId = typeof payload.grantId === "string" ? payload.grantId : null;
      const expiresAt = Date.now() + expiresIn * 1000;
      if (this.name === "RefreshToken") {
        const hash = sha256Hex(id);
        const stored = withoutSecret(payload);
        bucket.set(hash, { payload: stored, expiresAt, grantId, userCode: null });
        await rememberRefresh(grants, options, hash, stored, grantId);
        return;
      }
      bucket.set(id, { payload, expiresAt, grantId, userCode: null });
      if (this.name === "DeviceCode" && typeof payload.userCode === "string") {
        userCodes.set(payload.userCode, id);
      }
    }

    find(id: string): Promise<TokenPayload | undefined> {
      return Promise.resolve(this.#find(id));
    }

    #find(id: string): TokenPayload | undefined {
      const bucket = bucketFor(memory, this.name);
      const key = this.name === "RefreshToken" ? sha256Hex(id) : id;
      const stored = bucket.get(key);
      if (stored === undefined || stored.expiresAt <= Date.now()) {
        bucket.delete(key);
        return undefined;
      }
      if (this.name === "RefreshToken") {
        return { ...stored.payload, jti: id };
      }
      return stored.payload;
    }

    async findByUserCode(userCode: string): Promise<TokenPayload | undefined> {
      const id = userCodes.get(userCode);
      if (id === undefined) {
        return undefined;
      }
      return this.find(id);
    }

    async findByUid(uid: string): Promise<TokenPayload | undefined> {
      return this.find(uid);
    }

    async consume(id: string): Promise<void> {
      const bucket = bucketFor(memory, this.name);
      const key = this.name === "RefreshToken" ? sha256Hex(id) : id;
      const stored = bucket.get(key);
      if (stored === undefined) {
        return;
      }
      // A consumed DeviceCode or AuthorizationCode makes oidc-provider revoke the grant
      // on replay. Delete it instead: this request already holds the model, and a replay is not found.
      if (this.name === "DeviceCode" || this.name === "AuthorizationCode") {
        const userCode =
          stored.userCode ??
          (typeof stored.payload.userCode === "string" ? stored.payload.userCode : null);
        if (userCode !== null) {
          userCodes.delete(userCode);
        }
        bucket.delete(key);
        return;
      }
      stored.payload.consumed = true;
      if (this.name === "RefreshToken" && stored.grantId !== null) {
        const grant = grants.get(stored.grantId);
        if (grant !== undefined && !grant.rotatedRefreshHashes.includes(key)) {
          grant.rotatedRefreshHashes.push(key);
          if (grant.refreshTokenHash === key) {
            grant.refreshTokenHash = null;
            grant.refreshTokenPayload = null;
          }
          await options.updateGrant(grant.id, {
            rotatedRefreshHashes: [...grant.rotatedRefreshHashes],
            refreshTokenHash: grant.refreshTokenHash,
            refreshTokenPayload: grant.refreshTokenPayload,
          });
        }
      }
    }

    destroy(id: string): Promise<void> {
      const bucket = bucketFor(memory, this.name);
      const key = this.name === "RefreshToken" ? sha256Hex(id) : id;
      const stored = bucket.get(key);
      if (stored?.userCode !== null && stored?.userCode !== undefined) {
        userCodes.delete(stored.userCode);
      }
      bucket.delete(key);
      return Promise.resolve();
    }

    async revokeByGrantId(grantId: string): Promise<void> {
      destroyGrantTokens(memory, grantId);
      await markRevoked(grants, grantId, options);
    }
  };
}

function seed(
  memory: Map<string, Map<string, StoredModel>>,
  grants: Map<string, PersistedGrant>,
): void {
  const now = Math.floor(Date.now() / 1000);
  const grantsBucket = bucketFor(memory, "Grant");
  const refresh = bucketFor(memory, "RefreshToken");
  for (const grant of grants.values()) {
    grantsBucket.set(grant.id, {
      payload: {
        jti: grant.id,
        kind: "Grant",
        accountId: ACCOUNT_ID,
        clientId: CLIENT_ID,
        iat: now,
        exp: now + REFRESH_TTL_SECONDS,
      },
      expiresAt: Date.now() + REFRESH_TTL_SECONDS * 1000,
      grantId: grant.id,
      userCode: null,
    });
    if (grant.refreshTokenHash !== null && grant.refreshTokenPayload !== null) {
      refresh.set(grant.refreshTokenHash, {
        payload: grant.refreshTokenPayload,
        expiresAt: Date.now() + REFRESH_TTL_SECONDS * 1000,
        grantId: grant.id,
        userCode: null,
      });
    }
    for (const hash of grant.rotatedRefreshHashes) {
      refresh.set(hash, {
        payload: {
          kind: "RefreshToken",
          consumed: true,
          grantId: grant.id,
          clientId: CLIENT_ID,
          accountId: ACCOUNT_ID,
          iat: now,
          exp: now + REFRESH_TTL_SECONDS,
          scope: "offline_access",
        },
        expiresAt: Date.now() + REFRESH_TTL_SECONDS * 1000,
        grantId: grant.id,
        userCode: null,
      });
    }
  }
}

async function rememberRefresh(
  grants: Map<string, PersistedGrant>,
  options: EngineOptions,
  hash: string,
  payload: TokenPayload,
  grantId: string | null,
): Promise<void> {
  if (grantId === null) {
    return;
  }
  const grant = grants.get(grantId);
  if (grant === undefined || grant.revokedAt !== null) {
    return;
  }
  if (grant.refreshTokenHash !== null && grant.refreshTokenHash !== hash) {
    if (!grant.rotatedRefreshHashes.includes(grant.refreshTokenHash)) {
      grant.rotatedRefreshHashes.push(grant.refreshTokenHash);
    }
  }
  grant.refreshTokenHash = hash;
  grant.refreshTokenPayload = payload;
  await options.updateGrant(grant.id, {
    refreshTokenHash: hash,
    rotatedRefreshHashes: [...grant.rotatedRefreshHashes],
    refreshTokenPayload: payload,
  });
}

async function revokeRotatedRefresh(
  params: URLSearchParams,
  grants: Map<string, PersistedGrant>,
  memory: Map<string, Map<string, StoredModel>>,
  options: EngineOptions,
): Promise<Response | undefined> {
  if (params.get("grant_type") !== "refresh_token") {
    return undefined;
  }
  const token = params.get("refresh_token");
  if (token === null || token.length === 0) {
    return undefined;
  }
  const hash = sha256Hex(token);
  const matched = [...grants.values()].filter((grant) => grant.rotatedRefreshHashes.includes(hash));
  if (matched.length === 0) {
    return undefined;
  }
  for (const grant of matched) {
    await markRevoked(grants, grant.id, options);
    destroyGrantTokens(memory, grant.id);
  }
  return oauthJson(400, {
    error: "invalid_grant",
    error_description: "refresh token already used",
    message: "refresh token already used",
  });
}

async function markRevoked(
  grants: Map<string, PersistedGrant>,
  id: string,
  options: EngineOptions,
): Promise<void> {
  const grant = grants.get(id);
  if (grant === undefined || grant.revokedAt !== null) {
    return;
  }
  grant.revokedAt = options.now();
  grant.refreshTokenHash = null;
  grant.refreshTokenPayload = null;
  await options.updateGrant(id, {
    revokedAt: grant.revokedAt,
    refreshTokenHash: null,
    refreshTokenPayload: null,
  });
}

function destroyGrantTokens(memory: Map<string, Map<string, StoredModel>>, grantId: string): void {
  for (const [name, bucket] of memory) {
    if (name === "Grant") {
      bucket.delete(grantId);
      continue;
    }
    for (const [key, stored] of bucket) {
      if (stored.grantId === grantId || stored.payload.grantId === grantId) {
        bucket.delete(key);
      }
    }
  }
}

function bucketFor(
  memory: Map<string, Map<string, StoredModel>>,
  name: string,
): Map<string, StoredModel> {
  const existing = memory.get(name);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Map<string, StoredModel>();
  memory.set(name, created);
  return created;
}

function sweepMaps(
  memory: Map<string, Map<string, StoredModel>>,
  userCodes: Map<string, string>,
  nowMs: number,
): void {
  for (const name of ["DeviceCode", "AccessToken", "AuthorizationCode"]) {
    const bucket = memory.get(name);
    if (bucket === undefined) {
      continue;
    }
    for (const [key, stored] of bucket) {
      if (stored.expiresAt <= nowMs) {
        if (typeof stored.payload.userCode === "string") {
          userCodes.delete(stored.payload.userCode);
        }
        bucket.delete(key);
      }
    }
  }
}

function withoutSecret(payload: TokenPayload): TokenPayload {
  const copy: TokenPayload = { ...payload };
  delete copy.jti;
  return copy;
}

function cloneGrant(grant: PersistedGrant): PersistedGrant {
  return {
    ...grant,
    sources: grant.sources.map((source) => ({ ...source })),
    rotatedRefreshHashes: [...grant.rotatedRefreshHashes],
    refreshTokenPayload:
      grant.refreshTokenPayload === null ? null : { ...grant.refreshTokenPayload },
  };
}

function normalizeUserCode(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

async function formParams(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  const text = await request.text();
  if (type.includes("application/json")) {
    const body = text.trim() === "" ? {} : (JSON.parse(text) as unknown);
    const params = new URLSearchParams();
    if (isRecord(body)) {
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === "string") {
          params.set(key, value);
        }
      }
    }
    return params;
  }
  return new URLSearchParams(text);
}

function oauthJson(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function signingJwks(): { keys: JsonWebKey[] } {
  if (signingKeys === undefined) {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = privateKey.export({ format: "jwk" });
    signingKeys = { keys: [{ ...jwk, use: "sig", alg: "RS256", kid: "oneself" }] };
  }
  return signingKeys;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });
}
