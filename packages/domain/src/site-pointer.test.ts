import { describe, expect, it } from "vitest";

import {
  addMilliseconds,
  assessSiteArchive,
  decideSiteActivation,
  describeSite,
  initialSitePointer,
  MAX_SITE_ARCHIVE_BYTES,
  MAX_SITE_ARCHIVE_FILES,
  previewSite,
  requestSiteActivation,
  RESERVED_SITE_PATHS,
  SITE_ACTIVATION_TTL_MS,
  type Credential,
  type SiteArchiveEntry,
} from "./index.ts";

const NOW = "2026-04-01T00:00:00.000Z";
const releaseId = `rel_${"ab".repeat(16)}`;
const olderId = `rel_${"cd".repeat(16)}`;
const owner: Credential = { kind: "owner" };
const agent: Credential = {
  kind: "api_key",
  unrestrictedData: true,
  siteWrite: true,
  sources: [],
};
const writer: Credential = {
  kind: "api_key",
  unrestrictedData: false,
  siteWrite: false,
  sources: [],
};

function entry(path: string, size = 1, symlink = false): SiteArchiveEntry {
  return { path, size, symlink };
}

describe("site pointer", () => {
  it("starts at public-page and does not move for preview or a pending activation", () => {
    const pointer = initialSitePointer();
    const releases = [
      { id: releaseId, createdAt: NOW },
      { id: olderId, createdAt: NOW },
    ];
    expect(describeSite(pointer, releases)).toEqual({ pointer, releases });
    const preview = previewSite(pointer, releases, releaseId);
    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    expect(preview.value.pointer).toEqual({ releaseId: "public-page" });
    expect(preview.value.url).toBe(`/_preview/${releaseId}/`);
    expect(pointer.releaseId).toBe("public-page");

    const requested = requestSiteActivation({
      pointer,
      releases,
      credential: agent,
      activationId: "act_1",
      releaseId,
      now: NOW,
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) {
      return;
    }
    expect(requested.value.pointer).toEqual(pointer);
    expect(requested.value.activation.status).toBe("pending");
    expect(requested.value.approvalUrl).toBe("/admin/site-activations/act_1");
    expect(requested.value.activation.expiresAt).toBe(addMilliseconds(NOW, SITE_ACTIVATION_TTL_MS));
  });

  it("moves the pointer only when the owner approves rel_ or public-page", () => {
    const pointer = initialSitePointer();
    const releases = [
      { id: releaseId, createdAt: NOW },
      { id: olderId, createdAt: NOW },
    ];
    const pending = requestSiteActivation({
      pointer,
      releases,
      credential: agent,
      activationId: "act_1",
      releaseId,
      now: NOW,
    });
    if (!pending.ok) {
      throw new Error(pending.message);
    }
    const forbidden = decideSiteActivation({
      pointer,
      activation: pending.value.activation,
      decision: "approve",
      credential: agent,
      now: NOW,
    });
    expect(forbidden.ok).toBe(false);
    if (forbidden.ok) {
      return;
    }
    expect(forbidden.error).toBe("forbidden");
    expect(forbidden.value.pointer).toEqual(pointer);
    expect(forbidden.value.activation.status).toBe("pending");

    const approved = decideSiteActivation({
      pointer,
      activation: pending.value.activation,
      decision: "approve",
      credential: owner,
      now: NOW,
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) {
      return;
    }
    expect(approved.value.pointer.releaseId).toBe(releaseId);
    expect(approved.value.activation.status).toBe("approved");

    const back = requestSiteActivation({
      pointer: approved.value.pointer,
      releases,
      credential: owner,
      activationId: "act_back",
      releaseId: olderId,
      now: NOW,
    });
    if (!back.ok) {
      throw new Error(back.message);
    }
    const returned = decideSiteActivation({
      pointer: approved.value.pointer,
      activation: back.value.activation,
      decision: "approve",
      credential: owner,
      now: NOW,
    });
    expect(returned.ok).toBe(true);
    if (!returned.ok) {
      return;
    }
    expect(returned.value.pointer.releaseId).toBe(olderId);

    const original = requestSiteActivation({
      pointer: returned.value.pointer,
      releases,
      credential: owner,
      activationId: "act_original",
      releaseId: "public-page",
      now: NOW,
    });
    if (!original.ok) {
      throw new Error(original.message);
    }
    const restored = decideSiteActivation({
      pointer: returned.value.pointer,
      activation: original.value.activation,
      decision: "approve",
      credential: owner,
      now: NOW,
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.value.pointer.releaseId).toBe("public-page");
  });

  it("leaves the live pointer unchanged on rejection, expiry, or no decision", () => {
    const pointer = initialSitePointer();
    const releases = [{ id: releaseId, createdAt: NOW }];
    const pending = requestSiteActivation({
      pointer,
      releases,
      credential: owner,
      activationId: "act_1",
      releaseId,
      now: NOW,
    });
    if (!pending.ok) {
      throw new Error(pending.message);
    }
    expect(pending.value.pointer).toEqual(pointer);

    const rejected = decideSiteActivation({
      pointer,
      activation: pending.value.activation,
      decision: "reject",
      credential: owner,
      now: NOW,
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) {
      return;
    }
    expect(rejected.value.pointer).toEqual(pointer);
    expect(rejected.value.activation.status).toBe("rejected");

    const expiredAt = addMilliseconds(NOW, SITE_ACTIVATION_TTL_MS + 1);
    if (expiredAt === null) {
      throw new Error("clock");
    }
    const expired = decideSiteActivation({
      pointer,
      activation: pending.value.activation,
      decision: "approve",
      credential: owner,
      now: expiredAt,
    });
    expect(expired.ok).toBe(false);
    if (expired.ok) {
      return;
    }
    expect(expired.error).toBe("conflict");
    expect(expired.value.pointer).toEqual(pointer);
    expect(expired.value.activation.status).toBe("expired");
  });

  it("rejects a reserved, traversing, absolute, or linked path for the whole archive", () => {
    expect(assessSiteArchive([entry("index.html"), entry("blog/index.html")]).ok).toBe(true);
    expect(assessSiteArchive([entry("./index.html"), entry("blog/pcp/index.html")]).ok).toBe(true);
    for (const reserved of RESERVED_SITE_PATHS) {
      const assessed = assessSiteArchive([entry("index.html"), entry(`${reserved}/secret.html`)]);
      expect(assessed).toMatchObject({ ok: false, error: "invalid" });
    }
    expect(assessSiteArchive([entry("index.html"), entry("../secret.html")])).toMatchObject({
      ok: false,
      error: "invalid",
    });
    expect(assessSiteArchive([entry("index.html"), entry("/etc/passwd")])).toMatchObject({
      ok: false,
      error: "invalid",
    });
    expect(assessSiteArchive([entry("index.html", 1, true)])).toMatchObject({
      ok: false,
      error: "invalid",
    });
    expect(assessSiteArchive([entry("blog/index.html")])).toMatchObject({
      ok: false,
      error: "invalid",
    });
    expect(assessSiteArchive([entry("C:/index.html")])).toMatchObject({
      ok: false,
      error: "invalid",
    });
  });

  it("rejects an archive over 20 MiB or 200 files without creating a release", () => {
    const tooMany = [
      entry("index.html"),
      ...Array.from({ length: MAX_SITE_ARCHIVE_FILES }, (_, index) =>
        entry(`file-${String(index)}.txt`),
      ),
    ];
    expect(assessSiteArchive(tooMany)).toMatchObject({ ok: false, error: "payload_too_large" });
    const exact = [
      entry("index.html", 0),
      ...Array.from({ length: MAX_SITE_ARCHIVE_FILES - 1 }, (_, index) =>
        entry(`f${String(index)}.txt`, 0),
      ),
    ];
    expect(assessSiteArchive(exact).ok).toBe(true);
    expect(
      assessSiteArchive([entry("index.html", 1), entry("app.js", MAX_SITE_ARCHIVE_BYTES)]),
    ).toMatchObject({
      ok: false,
      error: "payload_too_large",
    });
    expect(assessSiteArchive([entry("index.html", MAX_SITE_ARCHIVE_BYTES)]).ok).toBe(true);
    expect(
      requestSiteActivation({
        pointer: initialSitePointer(),
        releases: [],
        credential: writer,
        activationId: "act",
        releaseId,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, error: "forbidden" });
  });
});
