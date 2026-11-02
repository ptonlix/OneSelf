import { gunzipSync, zstdDecompressSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { negotiateEncoding, staticFileResponse } from "./compress.ts";

const big = new TextEncoder().encode("<p>OneSelf</p>\n".repeat(400));

function request(acceptEncoding?: string): Request {
  return new Request("http://127.0.0.1:3000/", {
    headers: acceptEncoding === undefined ? {} : { "accept-encoding": acceptEncoding },
  });
}

describe("static compression", () => {
  it("prefers zstd, falls back to gzip and honours q=0", () => {
    expect(negotiateEncoding(null)).toBeNull();
    expect(negotiateEncoding("")).toBeNull();
    expect(negotiateEncoding("gzip, deflate, br, zstd")).toBe("zstd");
    expect(negotiateEncoding("gzip, deflate, br")).toBe("gzip");
    expect(negotiateEncoding("zstd;q=0, gzip;q=0.5")).toBe("gzip");
    expect(negotiateEncoding("GZIP")).toBe("gzip");
    expect(negotiateEncoding("*")).toBe("zstd");
    expect(negotiateEncoding("*;q=0")).toBeNull();
    expect(negotiateEncoding("identity, br")).toBeNull();
  });

  it("compresses text files and keeps the cache headers", async () => {
    const response = staticFileResponse(
      request("gzip, zstd"),
      big,
      new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("zstd");
    expect(response.headers.get("vary")).toBe("accept-encoding");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.byteLength).toBeLessThan(big.byteLength / 4);
    expect(new Uint8Array(zstdDecompressSync(body))).toEqual(big);

    const gzip = staticFileResponse(
      request("gzip"),
      big,
      new Headers({ "content-type": "text/css; charset=utf-8" }),
    );
    expect(gzip.headers.get("content-encoding")).toBe("gzip");
    expect(new Uint8Array(gunzipSync(new Uint8Array(await gzip.arrayBuffer())))).toEqual(big);
  });

  it("sends identity without Accept-Encoding, for small files and for binary formats", async () => {
    const plain = staticFileResponse(
      request(),
      big,
      new Headers({ "content-type": "text/javascript; charset=utf-8" }),
    );
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect(plain.headers.get("vary")).toBe("accept-encoding");
    expect(new Uint8Array(await plain.arrayBuffer())).toEqual(big);

    const small = staticFileResponse(
      request("gzip"),
      new TextEncoder().encode("tiny"),
      new Headers({ "content-type": "text/plain; charset=utf-8" }),
    );
    expect(small.headers.get("content-encoding")).toBeNull();

    const font = staticFileResponse(
      request("gzip, zstd"),
      big,
      new Headers({ "content-type": "font/woff2" }),
    );
    expect(font.headers.get("content-encoding")).toBeNull();
    expect(font.headers.get("vary")).toBeNull();
  });
});
