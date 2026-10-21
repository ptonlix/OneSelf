import { describe, expect, it } from "vitest";

import { sha256Hex } from "./hash.js";
import { isSlug, isSourceName, isTypeName, PRELOADED_SOURCE_NAMES } from "./identity.js";
import { emptyDomainState, sourcesAdd } from "./index.js";

describe("page identity", () => {
  it("rejects a slug that contains a slash or starts with a hyphen", () => {
    expect(isSlug("health/note")).toBe(false);
    expect(isSlug("-note")).toBe(false);
    expect(isSlug("Note")).toBe(false);
    expect(isSlug("")).toBe(false);
    expect(isSlug("a".repeat(81))).toBe(false);
    expect(isSlug("a")).toBe(true);
    expect(isSlug("a".repeat(80))).toBe(true);
    expect(isSlug("note-1")).toBe(true);
  });

  it("uses the source pattern for source names and types", () => {
    expect(isSourceName("health")).toBe(true);
    expect(isSourceName("a".repeat(63))).toBe(true);
    expect(isSourceName("a".repeat(64))).toBe(false);
    expect(isSourceName("Health")).toBe(false);
    expect(isSourceName("1health")).toBe(false);
    expect(isSourceName("")).toBe(false);
    expect(isTypeName("profile")).toBe(true);
    expect(isTypeName("Profile")).toBe(false);
  });

  it("does not preload public, private, or agents", () => {
    const state = emptyDomainState();
    expect(state.sources).toEqual([]);
    for (const name of PRELOADED_SOURCE_NAMES) {
      expect(state.sources.some((source) => source.id === name)).toBe(false);
      expect(isSourceName(name)).toBe(true);
    }
    const added = sourcesAdd(state, { kind: "owner" }, { id: "public" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    expect(added.value.state.sources.map((source) => source.id)).toEqual(["public"]);
  });

  it("hashes UTF-8 bytes as lowercase sha256", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("张三")).toMatch(/^[0-9a-f]{64}$/);
  });
});
