import type {
  ApiKeyRequest,
  CreateApiKeyBody,
  DeviceApprovalBody,
  LoginResult,
  PasswordResult,
  PendingApproval,
  RevealedApiKey,
  SiteActivation,
  SiteDecision,
  SourceDirectory,
  SourceGrant,
  Whoami,
} from "./types";

export class AdminRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AdminRequestError";
    this.status = status;
    this.code = code;
  }
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export interface HttpRequest {
  method: "GET" | "POST";
  path: string;
  json?: unknown;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

export function browserTransport(fetchImpl: typeof fetch = globalThis.fetch): HttpTransport {
  return async (request) => {
    const headers = new Headers();
    const init: RequestInit = {
      method: request.method,
      credentials: "include",
      headers,
    };
    if (request.json !== undefined) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(request.json);
    }
    const response = await fetchImpl(request.path, init);
    return { status: response.status, body: await readResponseBody(response) };
  };
}

export interface AdminClient {
  login(login: string, password: string): Promise<LoginResult>;
  changePassword(password: string): Promise<PasswordResult>;
  logout(): Promise<void>;
  whoami(): Promise<Whoami>;
  listSources(): Promise<SourceDirectory[]>;
  createApiKey(body: CreateApiKeyBody): Promise<PendingApproval>;
  getApiKeyRequest(id: string): Promise<ApiKeyRequest>;
  approveApiKey(id: string): Promise<RevealedApiKey>;
  activateSite(releaseId: string): Promise<PendingApproval>;
  getSiteActivation(id: string): Promise<SiteActivation>;
  decideSite(id: string, decision: SiteDecision): Promise<void>;
  approveDevice(body: DeviceApprovalBody): Promise<void>;
}

export function createAdminClient(transport: HttpTransport): AdminClient {
  return {
    async login(login, password) {
      const body = await send(transport, {
        method: "POST",
        path: "/admin/login",
        json: { login, password },
      });
      return parseLogin(body);
    },
    async changePassword(password) {
      const body = await send(transport, {
        method: "POST",
        path: "/admin/password",
        json: { password },
      });
      return parsePassword(body);
    },
    async logout() {
      await send(transport, { method: "POST", path: "/admin/logout" });
    },
    async whoami() {
      return parseWhoami(await send(transport, { method: "GET", path: "/pcp/v1/whoami" }));
    },
    async listSources() {
      return parseSourceList(await send(transport, { method: "GET", path: "/pcp/v1/sources" }));
    },
    async createApiKey(body) {
      return parsePending(
        await send(transport, { method: "POST", path: "/pcp/v1/api-keys", json: body }),
        "创建密钥的响应不能包含原文",
      );
    },
    async getApiKeyRequest(id) {
      return parseApiKeyRequest(
        await send(transport, { method: "GET", path: `/admin/api-keys/${encodeURIComponent(id)}` }),
      );
    },
    async approveApiKey(id) {
      return parseRevealedKey(
        await send(transport, {
          method: "POST",
          path: `/admin/api-keys/${encodeURIComponent(id)}/approve`,
          json: {},
        }),
      );
    },
    async activateSite(releaseId) {
      return parsePending(
        await send(transport, {
          method: "POST",
          path: "/pcp/v1/site/activate",
          json: { release_id: releaseId },
        }),
        "申请上线的响应不能包含密钥",
      );
    },
    async getSiteActivation(id) {
      return parseSiteActivation(
        await send(transport, {
          method: "GET",
          path: `/admin/site-activations/${encodeURIComponent(id)}`,
        }),
      );
    },
    async decideSite(id, decision) {
      await send(transport, {
        method: "POST",
        path: `/admin/site-activations/${encodeURIComponent(id)}/approve`,
        json: { decision },
      });
    },
    async approveDevice(body) {
      const response = await send(transport, { method: "POST", path: "/admin/device", json: body });
      if (isRecord(response) && "key" in response) {
        throw new ParseError("设备码批准不应返回密钥");
      }
    },
  };
}

export function failureMessage(reason: unknown): string {
  if (reason instanceof AdminRequestError || reason instanceof ParseError) return reason.message;
  return "请求失败";
}

async function send(transport: HttpTransport, request: HttpRequest): Promise<unknown> {
  const response = await transport(request);
  if (response.status === 200) return response.body;
  throw errorFrom(response.status, response.body);
}

function errorFrom(status: number, body: unknown): AdminRequestError {
  if (isRecord(body) && typeof body.error === "string" && typeof body.message === "string") {
    return new AdminRequestError(status, body.error, body.message);
  }
  return new AdminRequestError(status, "unrecognized", "响应无法识别");
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return parseJson(text);
  } catch {
    throw new ParseError("响应不是 JSON");
  }
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function parseLogin(body: unknown): LoginResult {
  if (!isRecord(body) || typeof body.must_change_password !== "boolean") {
    throw new ParseError("登录响应无法识别");
  }
  return { must_change_password: body.must_change_password };
}

function parsePassword(body: unknown): PasswordResult {
  if (!isRecord(body) || body.must_change_password !== false) {
    throw new ParseError("改密响应无法识别");
  }
  return { must_change_password: false };
}

function parseWhoami(body: unknown): Whoami {
  if (
    !isRecord(body) ||
    typeof body.credential !== "string" ||
    typeof body.admin !== "boolean" ||
    typeof body.site_write !== "boolean"
  ) {
    throw new ParseError("身份响应无法识别");
  }
  return {
    credential: body.credential,
    admin: body.admin,
    site_write: body.site_write,
    sources: parseGrants(body.sources),
  };
}

function parseSourceList(body: unknown): SourceDirectory[] {
  if (!isRecord(body) || !Array.isArray(body.sources)) {
    throw new ParseError("目录列表无法识别");
  }
  const seen = new Set<string>();
  return body.sources.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || item.id === "") {
      throw new ParseError("目录无法识别");
    }
    if (seen.has(item.id)) throw new ParseError("目录重复");
    seen.add(item.id);
    return { id: item.id };
  });
}

function parsePending(body: unknown, keyMessage: string): PendingApproval {
  if (isRecord(body) && "key" in body) throw new ParseError(keyMessage);
  if (
    !isRecord(body) ||
    typeof body.id !== "string" ||
    body.id === "" ||
    typeof body.status !== "string" ||
    typeof body.approval_url !== "string" ||
    typeof body.expires_at !== "string"
  ) {
    throw new ParseError("批准申请响应无法识别");
  }
  return {
    id: body.id,
    status: body.status,
    approval_url: body.approval_url,
    expires_at: body.expires_at,
  };
}

function parseApiKeyRequest(body: unknown): ApiKeyRequest {
  if (isRecord(body) && "key" in body) throw new ParseError("待批准请求不能包含密钥原文");
  if (
    !isRecord(body) ||
    typeof body.id !== "string" ||
    typeof body.label !== "string" ||
    typeof body.unrestricted_data !== "boolean" ||
    typeof body.site_write !== "boolean" ||
    typeof body.status !== "string" ||
    typeof body.expires_at !== "string"
  ) {
    throw new ParseError("密钥申请无法识别");
  }
  return {
    id: body.id,
    label: body.label,
    unrestricted_data: body.unrestricted_data,
    site_write: body.site_write,
    sources: parseGrants(body.sources),
    status: body.status,
    expires_at: body.expires_at,
  };
}

function parseSiteActivation(body: unknown): SiteActivation {
  if (
    !isRecord(body) ||
    typeof body.id !== "string" ||
    typeof body.release_id !== "string" ||
    typeof body.status !== "string" ||
    typeof body.expires_at !== "string"
  ) {
    throw new ParseError("上线申请无法识别");
  }
  return {
    id: body.id,
    release_id: body.release_id,
    status: body.status,
    expires_at: body.expires_at,
  };
}

function parseRevealedKey(body: unknown): RevealedApiKey {
  if (!isRecord(body) || typeof body.key !== "string" || !body.key.startsWith("osk_")) {
    throw new ParseError("批准响应没有 osk_ 密钥");
  }
  return { key: body.key };
}

function parseGrants(value: unknown): SourceGrant[] {
  if (!Array.isArray(value)) throw new ParseError("sources 不是数组");
  const seen = new Set<string>();
  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      item.id === "" ||
      typeof item.read !== "boolean" ||
      typeof item.write !== "boolean" ||
      typeof item.visibility !== "boolean"
    ) {
      throw new ParseError("权限项无法识别");
    }
    if (seen.has(item.id)) throw new ParseError("source 重复");
    seen.add(item.id);
    return { id: item.id, read: item.read, write: item.write, visibility: item.visibility };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
