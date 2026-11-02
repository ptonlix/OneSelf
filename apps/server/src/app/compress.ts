import zlib from "node:zlib";

// Static files (the built-in home page, the admin app and published sites) are compressed by the
// server itself, so every ingress benefits: local, LAN, Cloudflare, Caddy and Tailscale. Only
// files go through here; API responses stay uncompressed, so no secret is ever compressed next to
// request-controlled text.

type Encoding = "zstd" | "gzip";

const MIN_BYTES = 1024;

const zstdCompressSync = (zlib as { zstdCompressSync?: typeof zlib.zstdCompressSync })
  .zstdCompressSync;

/** Server preference order; zstd only when this Node has it. */
const SUPPORTED: readonly Encoding[] =
  typeof zstdCompressSync === "function" ? ["zstd", "gzip"] : ["gzip"];

/** Picks the encoding to send for an Accept-Encoding header, or null for identity. */
export function negotiateEncoding(acceptEncoding: string | null): Encoding | null {
  if (acceptEncoding === null) {
    return null;
  }
  const weights = new Map<string, number>();
  for (const part of acceptEncoding.split(",")) {
    const [rawName, ...params] = part.split(";");
    const name = rawName?.trim().toLowerCase() ?? "";
    if (name.length === 0) {
      continue;
    }
    let weight = 1;
    for (const param of params) {
      const [key, value] = param.split("=");
      if (key?.trim().toLowerCase() === "q") {
        const parsed = Number(value?.trim());
        weight = Number.isFinite(parsed) ? parsed : 0;
      }
    }
    weights.set(name, weight);
  }
  const wildcard = weights.get("*");
  for (const encoding of SUPPORTED) {
    const weight = weights.get(encoding) ?? wildcard ?? 0;
    if (weight > 0) {
      return encoding;
    }
  }
  return null;
}

function compressible(contentType: string): boolean {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/javascript" ||
    type === "image/svg+xml"
  );
}

/**
 * Builds a 200 response for a static file, compressed when the client accepts it and the type is
 * text-like. Already-compressed formats (woff2, images, pdf) pass through unchanged.
 */
export function staticFileResponse(
  request: Request,
  bytes: Uint8Array,
  headers: Headers,
): Response {
  const contentType = headers.get("content-type") ?? "";
  if (!compressible(contentType)) {
    return new Response(new Uint8Array(bytes), { status: 200, headers });
  }
  headers.append("vary", "accept-encoding");
  const encoding =
    bytes.byteLength >= MIN_BYTES
      ? negotiateEncoding(request.headers.get("accept-encoding"))
      : null;
  if (encoding === null) {
    return new Response(new Uint8Array(bytes), { status: 200, headers });
  }
  headers.set("content-encoding", encoding);
  return new Response(new Uint8Array(encode(encoding, bytes)), { status: 200, headers });
}

function encode(encoding: Encoding, bytes: Uint8Array): Uint8Array {
  if (encoding === "zstd" && zstdCompressSync !== undefined) {
    // Level 9: ~10% smaller than gzip on the home page for well under a millisecond.
    return zstdCompressSync(bytes, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 9 } });
  }
  return zlib.gzipSync(bytes);
}
