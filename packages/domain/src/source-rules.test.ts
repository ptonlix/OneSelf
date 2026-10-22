import { describe, expect, it } from "vitest";

import {
  addMilliseconds,
  deletePage,
  emptyDomainState,
  getPage,
  putPage,
  readPublicPage,
  resolveSlugs,
  runHourlyMaintenance,
  SOFT_DELETE_RETENTION_MS,
  sourcesAdd,
  sourcesDelete,
  sourcesList,
  sourcesRestore,
  sourcesStatus,
  type Credential,
  type DomainState,
} from "./index.ts";

const NOW = "2026-03-01T00:00:00.000Z";
const owner: Credential = { kind: "owner" };
const agent: Credential = {
  kind: "api_key",
  unrestrictedData: true,
  siteWrite: true,
  sources: [],
};
const restricted: Credential = {
  kind: "api_key",
  unrestrictedData: false,
  siteWrite: false,
  sources: [{ id: "health", read: true, write: true, visibility: true }],
};
const oauth: Credential = {
  kind: "oauth",
  siteWrite: true,
  sources: [{ id: "health", read: true, write: true, visibility: true }],
};

function markdown(title: string, body: string, visibility = "public"): string {
  return `---\ntype: note\ntitle: ${title}\nvisibility: ${visibility}\n---\n${body}`;
}

function world(): DomainState {
  let state = emptyDomainState();
  for (const id of ["health", "learning"]) {
    const added = sourcesAdd(state, owner, { id });
    if (!added.ok) {
      throw new Error(added.message);
    }
    state = added.value.state;
  }
  const note = putPage(
    state,
    { credential: owner, now: NOW },
    {
      source: "health",
      slug: "note",
      markdown: markdown("Public note", "visible\n"),
    },
  );
  if (!note.ok) {
    throw new Error(note.message);
  }
  const older = putPage(
    note.value.state,
    { credential: owner, now: NOW },
    {
      source: "health",
      slug: "older",
      markdown: markdown("Older", "gone\n"),
    },
  );
  if (!older.ok) {
    throw new Error(older.message);
  }
  const link = putPage(
    older.value.state,
    { credential: owner, now: NOW },
    {
      source: "learning",
      slug: "index",
      markdown: markdown("Index", "See [[health/note]]\n"),
    },
  );
  if (!link.ok) {
    throw new Error(link.message);
  }
  return {
    ...link.value.state,
    files: [
      {
        id: "scan",
        objectKey: "files/scan",
        mediaType: "application/pdf",
        byteSize: 4,
        sha256: "ff",
        pageSource: "health",
        pageSlug: "note",
        createdAt: NOW,
      },
    ],
  };
}

describe("source delete and restore", () => {
  it("forbids an API key or OAuth grant from deleting a directory", () => {
    const state = world();
    for (const credential of [agent, oauth]) {
      const deleted = sourcesDelete(state, credential, { id: "health", now: NOW });
      expect(deleted).toMatchObject({ ok: false, error: "forbidden" });
    }
    expect(readPublicPage(state, "health", "note").ok).toBe(true);
    expect(sourcesList(state, owner).ok).toBe(true);
  });

  it("hides only pages that were not already deleted, and restore does not resurrect them", () => {
    const state = world();
    const removed = deletePage(state, { credential: owner, now: NOW }, "health", "older");
    if (!removed.ok) {
      throw new Error(removed.message);
    }
    const beforePointer = removed.value.state.site.pointer;
    const learning = removed.value.state.pages.find((page) => page.slug === "index")?.markdown;
    const deleted = sourcesDelete(removed.value.state, owner, { id: "health", now: NOW });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) {
      return;
    }
    const hidden = deleted.value.state.pages.find((page) => page.slug === "note");
    const older = deleted.value.state.pages.find((page) => page.slug === "older");
    expect(hidden).toMatchObject({ deletedAt: null, hiddenBySource: true });
    expect(older).toMatchObject({ deletedAt: NOW, hiddenBySource: false });
    expect(readPublicPage(deleted.value.state, "health", "note")).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(getPage(deleted.value.state, owner, "health", "note")).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(deleted.value.state.site.pointer).toEqual(beforePointer);
    expect(deleted.value.state.pages.find((page) => page.slug === "index")?.markdown).toBe(
      learning,
    );
    const resolved = resolveSlugs(deleted.value.state, owner, [{ source: "health", slug: "note" }]);
    expect(resolved).toMatchObject({
      ok: true,
      value: [{ source: "health", slug: "note", exists: false }],
    });
    const listed = sourcesList(deleted.value.state, owner);
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      return;
    }
    expect(listed.value).toEqual([{ id: "learning" }]);

    const atWindow = addMilliseconds(NOW, SOFT_DELETE_RETENTION_MS);
    if (atWindow === null) {
      throw new Error("clock");
    }
    const restored = sourcesRestore(deleted.value.state, owner, { id: "health", now: atWindow });
    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(getPage(restored.value.state, owner, "health", "note").ok).toBe(true);
    expect(readPublicPage(restored.value.state, "health", "note").ok).toBe(true);
    expect(getPage(restored.value.state, owner, "health", "older")).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(restored.value.state.pages.find((page) => page.slug === "older")?.deletedAt).toBe(NOW);
    const listedAgain = sourcesList(restored.value.state, owner);
    expect(listedAgain.ok).toBe(true);
    if (!listedAgain.ok) {
      return;
    }
    expect(listedAgain.value).toEqual([{ id: "health" }, { id: "learning" }]);
  });

  it("conflicts on a soft-deleted name and allows that name again after the hourly purge", () => {
    const state = world();
    const deleted = sourcesDelete(state, owner, { id: "health", now: NOW });
    if (!deleted.ok) {
      throw new Error(deleted.message);
    }
    const again = sourcesAdd(deleted.value.state, agent, { id: "health" });
    expect(again).toMatchObject({ ok: false, error: "conflict" });
    expect(deleted.value.state.sources.filter((source) => source.id === "health")).toHaveLength(1);

    const restrictedAdd = sourcesAdd(state, restricted, { id: "finance" });
    expect(restrictedAdd).toMatchObject({ ok: false, error: "forbidden" });
    expect(state.sources.some((source) => source.id === "finance")).toBe(false);

    const justAfter = addMilliseconds(NOW, SOFT_DELETE_RETENTION_MS + 1);
    if (justAfter === null) {
      throw new Error("clock");
    }
    const purged = runHourlyMaintenance(deleted.value.state, justAfter);
    expect(purged.sources.some((source) => source.id === "health")).toBe(false);
    expect(purged.pages.some((page) => page.source === "health")).toBe(false);
    expect(purged.files[0]).toMatchObject({ id: "scan", pageSource: null, pageSlug: null });
    expect(purged.site.pointer.releaseId).toBe("public-page");
    const readded = sourcesAdd(purged, owner, { id: "health" });
    expect(readded.ok).toBe(true);
  });

  it("reports the live page count and treats a deleted directory as not_found", () => {
    const state = world();
    const removed = deletePage(state, { credential: owner, now: NOW }, "health", "older");
    if (!removed.ok) {
      throw new Error(removed.message);
    }
    expect(sourcesStatus(removed.value.state, owner, "health")).toMatchObject({
      ok: true,
      value: { id: "health", pageCount: 1, latestWriteAt: NOW },
    });
    const deleted = sourcesDelete(removed.value.state, owner, { id: "health", now: NOW });
    if (!deleted.ok) {
      throw new Error(deleted.message);
    }
    expect(sourcesStatus(deleted.value.state, owner, "health")).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(getPage(deleted.value.state, owner, "health", "note")).toMatchObject({
      ok: false,
      error: "not_found",
    });
  });
});
