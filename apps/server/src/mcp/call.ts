import { fail, type DomainResult, type PageEdit, type PutPageInput } from "@oneself/domain";

import { isRecord } from "../app/json.js";
import type { Actor, Runtime } from "../app/runtime.js";

export async function callTool(
  runtime: Runtime,
  name: string,
  args: Record<string, unknown>,
  actor: Actor,
): Promise<DomainResult<unknown>> {
  switch (name) {
    case "put_page":
      return runtime.putPage(actor, pageInput(args));
    case "edit_page": {
      const edits = parseEdits(args.edits);
      if (
        typeof args.source !== "string" ||
        typeof args.slug !== "string" ||
        typeof args.hash !== "string" ||
        edits === null
      ) {
        return fail("invalid", "edit is invalid");
      }
      return runtime.editPage(actor, {
        source: args.source,
        slug: args.slug,
        hash: args.hash,
        edits,
      });
    }
    case "put_pages": {
      const pages = parsePages(args.pages);
      if (pages === null) {
        return fail("invalid", "pages are invalid");
      }
      return runtime.putPages(actor, pages);
    }
    case "get_page":
      return runtime.getPage(actor, stringArg(args.source), stringArg(args.slug));
    case "list_pages":
      return runtime.listPages(actor, {
        ...(typeof args.source === "string" ? { source: args.source } : {}),
        ...(typeof args.type === "string" ? { type: args.type } : {}),
        ...(typeof args.prefix === "string" ? { prefix: args.prefix } : {}),
      });
    case "delete_page":
      return runtime.deletePage(actor, stringArg(args.source), stringArg(args.slug));
    case "restore_page":
      return runtime.restorePage(actor, stringArg(args.source), stringArg(args.slug));
    case "get_versions":
      return runtime.versions(actor, stringArg(args.source), stringArg(args.slug));
    case "revert_version":
      return runtime.revert(
        actor,
        stringArg(args.source),
        stringArg(args.slug),
        stringArg(args.hash),
      );
    case "resolve_slugs": {
      const slugs = parsePairs(args.slugs);
      if (slugs === null) {
        return fail("invalid", "slugs are invalid");
      }
      return runtime.resolve(actor, slugs);
    }
    case "file_upload": {
      if (typeof args.data_base64 !== "string" || typeof args.media_type !== "string") {
        return fail("invalid", "file is required");
      }
      return runtime.uploadFile(actor, Buffer.from(args.data_base64, "base64"), args.media_type);
    }
    case "file_list":
      return runtime.listFiles(
        actor,
        typeof args.source === "string" ? args.source : undefined,
        typeof args.slug === "string" ? args.slug : undefined,
      );
    case "file_url":
      return runtime.fileUrl(actor, stringArg(args.id));
    case "search":
      return runtime.search(actor, args, false);
    case "query":
      return runtime.query(actor, args);
    case "add_tag":
      return runtime.addTag(
        actor,
        stringArg(args.source),
        stringArg(args.slug),
        stringArg(args.tag),
      );
    case "remove_tag":
      return runtime.removeTag(
        actor,
        stringArg(args.source),
        stringArg(args.slug),
        stringArg(args.tag),
      );
    case "get_tags":
      return runtime.getTags(actor, stringArg(args.source), stringArg(args.slug));
    case "add_link":
    case "remove_link": {
      const ends = parseLink(args);
      if (ends === null) {
        return fail("invalid", "link is invalid");
      }
      return name === "add_link"
        ? runtime.addLink(actor, ends.from, ends.to)
        : runtime.removeLink(actor, ends.from, ends.to);
    }
    case "get_links":
      return runtime.getLinks(actor, stringArg(args.source), stringArg(args.slug));
    case "get_backlinks":
      return runtime.getBacklinks(actor, stringArg(args.source), stringArg(args.slug));
    case "add_timeline_entry":
      if (typeof args.date !== "string" || typeof args.title !== "string") {
        return fail("invalid", "timeline entry is invalid");
      }
      return runtime.addTimelineEntry(actor, stringArg(args.source), stringArg(args.slug), {
        date: args.date,
        title: args.title,
        detail: typeof args.detail === "string" ? args.detail : null,
      });
    case "get_timeline":
      return runtime.getTimeline(actor, stringArg(args.source), stringArg(args.slug));
    case "remember": {
      if (
        typeof args.source !== "string" ||
        typeof args.slug !== "string" ||
        typeof args.entity !== "string" ||
        typeof args.statement !== "string"
      ) {
        return fail("invalid", "fact is invalid");
      }
      return runtime.remember(actor, {
        source: args.source,
        slug: args.slug,
        ...(typeof args.id === "string" ? { id: args.id } : {}),
        entity: args.entity,
        statement: args.statement,
        confidence: typeof args.confidence === "number" ? args.confidence : null,
        validUntil: typeof args.valid_until === "string" ? args.valid_until : null,
      });
    }
    case "forget":
      return runtime.forget(
        actor,
        stringArg(args.source),
        stringArg(args.slug),
        stringArg(args.id),
      );
    case "recall":
      return runtime.recall(actor, args);
    case "sources_list":
      return runtime.sourcesList(actor);
    case "sources_add":
      return runtime.sourcesAdd(actor, stringArg(args.id));
    case "sources_delete":
      return runtime.sourcesDelete(actor, stringArg(args.id));
    case "sources_restore":
      return runtime.sourcesRestore(actor, stringArg(args.id));
    case "sources_status":
      return runtime.sourcesStatus(actor, stringArg(args.id));
    case "whoami":
      return runtime.whoami(actor);
    case "list_skills":
      return runtime.listSkills(actor);
    case "get_skill":
      return runtime.readSkill(actor, stringArg(args.name));
    case "list_sites":
      return runtime.listSites(actor);
    case "get_site":
      return runtime.siteSourceZip(actor);
    case "put_site": {
      if (typeof args.archive_base64 !== "string") {
        return fail("invalid", "archive is required");
      }
      return runtime.putSite(actor, Buffer.from(args.archive_base64, "base64"));
    }
    case "preview_site":
      return runtime.preview(actor, stringArg(args.id));
    case "activate_site":
      return runtime.activate(actor, stringArg(args.release_id));
    default:
      return fail("not_found", "operation not found");
  }
}

function pageInput(args: Record<string, unknown>): PutPageInput {
  const source = stringArg(args.source);
  const slug = stringArg(args.slug);
  const markdown = stringArg(args.markdown);
  return typeof args.hash === "string"
    ? { source, slug, markdown, hash: args.hash }
    : { source, slug, markdown };
}

function stringArg(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseEdits(value: unknown): PageEdit[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const edits: PageEdit[] = [];
  for (const edit of value) {
    if (!isRecord(edit) || typeof edit.search !== "string" || typeof edit.replace !== "string") {
      return null;
    }
    edits.push({ search: edit.search, replace: edit.replace });
  }
  return edits;
}

function parsePages(value: unknown): PutPageInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const pages: PutPageInput[] = [];
  for (const page of value) {
    if (
      !isRecord(page) ||
      typeof page.source !== "string" ||
      typeof page.slug !== "string" ||
      typeof page.markdown !== "string"
    ) {
      return null;
    }
    pages.push(
      typeof page.hash === "string"
        ? { source: page.source, slug: page.slug, markdown: page.markdown, hash: page.hash }
        : { source: page.source, slug: page.slug, markdown: page.markdown },
    );
  }
  return pages;
}

function parsePairs(value: unknown): { source: string; slug: string }[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const pairs: { source: string; slug: string }[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.source !== "string" || typeof item.slug !== "string") {
      return null;
    }
    pairs.push({ source: item.source, slug: item.slug });
  }
  return pairs;
}

function parseLink(args: Record<string, unknown>): {
  from: { source: string; slug: string };
  to: { source: string; slug: string };
} | null {
  if (!isRecord(args.from) || !isRecord(args.to)) {
    return null;
  }
  if (
    typeof args.from.source !== "string" ||
    typeof args.from.slug !== "string" ||
    typeof args.to.source !== "string" ||
    typeof args.to.slug !== "string"
  ) {
    return null;
  }
  return {
    from: { source: args.from.source, slug: args.from.slug },
    to: { source: args.to.source, slug: args.to.slug },
  };
}
