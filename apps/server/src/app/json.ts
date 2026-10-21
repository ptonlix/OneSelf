import { errorCodes, type ErrorCode } from "@oneself/operations";
import { isSourceName, type SourceGrant } from "@oneself/domain";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorStatus(error: ErrorCode): number {
  const found = errorCodes.find((item) => item.error === error);
  return found === undefined ? 400 : found.status;
}

export function parseGrants(value: unknown): SourceGrant[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const grants: SourceGrant[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !isSourceName(item.id) ||
      typeof item.read !== "boolean" ||
      typeof item.write !== "boolean" ||
      typeof item.visibility !== "boolean" ||
      seen.has(item.id)
    ) {
      return null;
    }
    seen.add(item.id);
    grants.push({ id: item.id, read: item.read, write: item.write, visibility: item.visibility });
  }
  return grants;
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") {
    return {};
  }
  return JSON.parse(text) as unknown;
}

export function sendJson(body: unknown, status = 200, headers?: Headers): Response {
  const responseHeaders = headers ?? new Headers();
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export function sendError(
  error: ErrorCode,
  message: string,
  status = errorStatus(error),
): Response {
  return sendJson({ error, message }, status);
}

export function rateLimited(): Response {
  return sendJson({ error: "forbidden", message: "rate limit exceeded" }, 429);
}

export function noStore(response: Response): Response {
  response.headers.set("cache-control", "no-store");
  return response;
}
