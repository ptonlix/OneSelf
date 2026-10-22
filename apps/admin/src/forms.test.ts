import { describe, expect, it } from "vitest";
import {
  createApiKeyBody,
  deviceApprovalBody,
  isReleaseId,
  selectedGrants,
  toggleDraft,
} from "./forms";
import type { SourceDraft } from "./types";

const drafts: SourceDraft[] = [
  { id: "notes", read: false, write: false, visibility: false },
  { id: "work", read: true, write: false, visibility: true },
];

describe("approval payloads", () => {
  it("omits sources that were not granted", () => {
    expect(selectedGrants(drafts)).toEqual([
      { id: "work", read: true, write: false, visibility: true },
    ]);
  });

  it("sends an empty source list when the key has unrestricted data", () => {
    const body = createApiKeyBody({
      label: "  laptop  ",
      unrestrictedData: true,
      siteWrite: false,
      drafts: toggleDraft(drafts, "notes", "read", true),
    });
    expect(body).toEqual({
      label: "laptop",
      unrestricted_data: true,
      site_write: false,
      sources: [],
    });
    expect([...Object.keys(body)].sort()).toEqual([
      "label",
      "site_write",
      "sources",
      "unrestricted_data",
    ]);
  });

  it("does not give a device approval unrestricted data", () => {
    const body = deviceApprovalBody({
      userCode: " WDJB-MJHT ",
      siteWrite: true,
      drafts,
    });
    expect(body).toEqual({
      user_code: "WDJB-MJHT",
      site_write: true,
      sources: [{ id: "work", read: true, write: false, visibility: true }],
    });
    expect(Object.keys(body)).not.toContain("unrestricted_data");
    expect(body).not.toHaveProperty("key");
  });

  it("accepts public-page and a 32-hex release id", () => {
    expect(isReleaseId("public-page")).toBe(true);
    expect(isReleaseId(`rel_${"a".repeat(32)}`)).toBe(true);
    expect(isReleaseId("rel_short")).toBe(false);
    expect(isReleaseId("../admin")).toBe(false);
  });
});
