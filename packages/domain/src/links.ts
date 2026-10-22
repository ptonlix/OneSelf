import { isSlug, isSourceName } from "./identity.ts";

export type PageLink = {
  readonly toSource: string;
  readonly toSlug: string;
};

const LINK_PATTERN = /\[\[([a-z][a-z0-9-]{0,62})\/([a-z0-9][a-z0-9-]{0,79})\]\]/g;

export function extractLinks(body: string): PageLink[] {
  const links: PageLink[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(LINK_PATTERN)) {
    const toSource = match[1] ?? "";
    const toSlug = match[2] ?? "";
    if (!isSourceName(toSource) || !isSlug(toSlug)) {
      continue;
    }
    const key = `${toSource}/${toSlug}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    links.push({ toSource, toSlug });
  }
  return links;
}
