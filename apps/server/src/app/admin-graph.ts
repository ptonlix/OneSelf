export const GRAPH_PAGE_CAP = 2000;
export const GRAPH_LINK_CAP = 8000;

export type GraphSource = {
  readonly id: string;
  readonly page_count: number;
};

export type GraphPage = {
  readonly source: string;
  readonly slug: string;
  readonly type: string;
  readonly title: string;
  readonly visibility: "public" | "private";
  readonly updated_at: string;
  readonly file_count: number;
  readonly media_types: readonly string[];
};

export type GraphLink = {
  readonly from: { readonly source: string; readonly slug: string };
  readonly to: { readonly source: string; readonly slug: string };
  readonly broken: boolean;
};

export type AdminGraph = {
  readonly sources: readonly GraphSource[];
  readonly pages: readonly GraphPage[];
  readonly links: readonly GraphLink[];
  readonly truncated: boolean;
};

type GraphInput = {
  readonly sources: readonly { readonly id: string; readonly deletedAt: string | null }[];
  readonly pages: readonly {
    readonly source: string;
    readonly slug: string;
    readonly type: string;
    readonly title: string;
    readonly visibility: "public" | "private";
    readonly updatedAt: string;
    readonly deletedAt: string | null;
    readonly hiddenBySource: boolean;
    readonly links: readonly { readonly toSource: string; readonly toSlug: string }[];
  }[];
  readonly files: readonly {
    readonly pageSource: string | null;
    readonly pageSlug: string | null;
    readonly mediaType: string;
  }[];
};

export function buildAdminGraph(input: GraphInput): AdminGraph {
  const liveSources = input.sources
    .filter((source) => source.deletedAt === null)
    .map((source) => source.id)
    .sort((left, right) => left.localeCompare(right));
  const liveIds = new Set(liveSources);
  const livePages = input.pages
    .filter((page) => page.deletedAt === null && !page.hiddenBySource && liveIds.has(page.source))
    .sort(
      (left, right) =>
        left.source.localeCompare(right.source) || left.slug.localeCompare(right.slug),
    );
  const liveKeys = new Set(livePages.map((page) => key(page.source, page.slug)));
  const files = new Map<string, { count: number; types: string[] }>();
  for (const file of input.files) {
    if (file.pageSource === null || file.pageSlug === null) continue;
    const id = key(file.pageSource, file.pageSlug);
    if (!liveKeys.has(id)) continue;
    const rollup = files.get(id) ?? { count: 0, types: [] };
    rollup.count += 1;
    if (!rollup.types.includes(file.mediaType)) rollup.types.push(file.mediaType);
    files.set(id, rollup);
  }
  const counts = new Map<string, number>();
  for (const id of liveSources) counts.set(id, 0);
  for (const page of livePages) counts.set(page.source, (counts.get(page.source) ?? 0) + 1);
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  for (const page of livePages) {
    for (const link of page.links) {
      const id = `${key(page.source, page.slug)}>${key(link.toSource, link.toSlug)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      links.push({
        from: { source: page.source, slug: page.slug },
        to: { source: link.toSource, slug: link.toSlug },
        broken: !liveKeys.has(key(link.toSource, link.toSlug)),
      });
    }
  }
  links.sort(
    (left, right) =>
      key(left.from.source, left.from.slug).localeCompare(
        key(right.from.source, right.from.slug),
      ) || key(left.to.source, left.to.slug).localeCompare(key(right.to.source, right.to.slug)),
  );
  const truncated = livePages.length > GRAPH_PAGE_CAP || links.length > GRAPH_LINK_CAP;
  return {
    sources: liveSources.map((id) => ({ id, page_count: counts.get(id) ?? 0 })),
    pages: livePages.slice(0, GRAPH_PAGE_CAP).map((page) => {
      const rollup = files.get(key(page.source, page.slug));
      return {
        source: page.source,
        slug: page.slug,
        type: page.type,
        title: page.title,
        visibility: page.visibility,
        updated_at: page.updatedAt,
        file_count: rollup?.count ?? 0,
        media_types: [...(rollup?.types ?? [])].sort((left, right) => left.localeCompare(right)),
      };
    }),
    links: links.slice(0, GRAPH_LINK_CAP),
    truncated,
  };
}

function key(source: string, slug: string): string {
  return `${source}/${slug}`;
}
