import { PublicClientFailure } from "@oneself/public-client";
import type { PublicClient, PublicPage } from "@oneself/public-client";
import { fileIds, renderOriginalPage, renderStatus } from "./render";
import type { DisplayFile, DisplayPage } from "./render";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type ObjectUrlFactory = (bytes: Uint8Array, mediaType: string) => string;

export async function loadOriginalPage(
  client: PublicClient,
  createObjectUrl: ObjectUrlFactory,
): Promise<string> {
  const summaries = await client.listPages();
  if (summaries.length === 0) {
    return renderStatus("empty", "没有公开页");
  }

  const pages: DisplayPage[] = [];
  for (const summary of summaries) {
    let page: PublicPage;
    try {
      page = await client.getPage(summary.source, summary.slug);
    } catch (error) {
      if (error instanceof PublicClientFailure && error.error === "not_found") {
        continue;
      }
      throw error;
    }
    pages.push({ page, files: await loadFiles(client, page, createObjectUrl) });
  }

  return renderOriginalPage(pages);
}

async function loadFiles(
  client: PublicClient,
  page: PublicPage,
  createObjectUrl: ObjectUrlFactory,
): Promise<readonly DisplayFile[]> {
  const files: DisplayFile[] = [];
  for (const id of fileIds(page.frontmatter)) {
    try {
      const media = await client.getMedia(id);
      if (!IMAGE_TYPES.has(media.mediaType) && media.mediaType !== "application/pdf") {
        continue;
      }
      files.push({
        id: media.id,
        mediaType: media.mediaType,
        href: createObjectUrl(media.bytes, media.mediaType),
      });
    } catch (error) {
      if (error instanceof PublicClientFailure && error.error === "not_found") {
        continue;
      }
      throw error;
    }
  }
  return files;
}
