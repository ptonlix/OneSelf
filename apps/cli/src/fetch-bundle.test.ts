import { afterEach, expect, it } from "vitest";

import { resolveTag, tagFromReleaseLocation } from "./fetch-bundle.ts";

const savedRepo = process.env.ONESELF_REPO;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (savedRepo === undefined) Reflect.deleteProperty(process.env, "ONESELF_REPO");
  else process.env.ONESELF_REPO = savedRepo;
  globalThis.fetch = originalFetch;
});

function redirect(location: string | undefined, status = 302): Promise<Response> {
  const headers = new Headers();
  if (location !== undefined) headers.set("location", location);
  return Promise.resolve(new Response(null, { status, headers }));
}

it("reads an absolute or relative release redirect", () => {
  expect(
    tagFromReleaseLocation(
      "https://github.com/ptonlix/OneSelf/releases/tag/v1.2.3",
      "ptonlix/OneSelf",
    ),
  ).toBe("v1.2.3");
  expect(tagFromReleaseLocation("/releases/tag/v1.2.3", "ptonlix/OneSelf")).toBe("v1.2.3");
  expect(tagFromReleaseLocation("/ptonlix/OneSelf/releases/tag/v1.2.3", "ptonlix/OneSelf")).toBe(
    "v1.2.3",
  );
});

it("rejects another host, another repo, or a non-version tag", () => {
  expect(
    tagFromReleaseLocation(
      "https://example.com/ptonlix/OneSelf/releases/tag/v1.2.3",
      "ptonlix/OneSelf",
    ),
  ).toBeUndefined();
  expect(
    tagFromReleaseLocation(
      "https://github.com/other/OneSelf/releases/tag/v1.2.3",
      "ptonlix/OneSelf",
    ),
  ).toBeUndefined();
  expect(
    tagFromReleaseLocation(
      "https://github.com/ptonlix/OneSelf/releases/tag/latest",
      "ptonlix/OneSelf",
    ),
  ).toBeUndefined();
  expect(tagFromReleaseLocation("", "ptonlix/OneSelf")).toBeUndefined();
});

it("resolves latest from the github.com redirect and not the API", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    return redirect("https://github.com/ptonlix/OneSelf/releases/tag/v1.2.3");
  }) as typeof fetch;
  await expect(resolveTag("latest")).resolves.toBe("v1.2.3");
  expect(urls).toEqual(["https://github.com/ptonlix/OneSelf/releases/latest"]);
  expect(new URL(urls[0] ?? "").hostname).toBe("github.com");
});

it("uses ONESELF_REPO and does not fall back when the redirect is missing", async () => {
  process.env.ONESELF_REPO = "example/oneself";
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    return redirect(undefined, 404);
  }) as typeof fetch;
  await expect(resolveTag("latest")).rejects.toThrow(/无法读取 GitHub Release（HTTP 404）/);
  expect(urls).toEqual(["https://github.com/example/oneself/releases/latest"]);
});

it("does not look up a concrete ref", async () => {
  let fetches = 0;
  globalThis.fetch = (async () => {
    fetches += 1;
    return redirect("https://github.com/ptonlix/OneSelf/releases/tag/v9.9.9");
  }) as typeof fetch;
  await expect(resolveTag("v1.2.3")).resolves.toBe("v1.2.3");
  expect(fetches).toBe(0);
});
