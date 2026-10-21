import { createHash } from "node:crypto";

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function pageObjectKey(source: string, slug: string, contentHash: string): string {
  return `pages/${source}/${slug}/${contentHash}.md`;
}

export function fileObjectKey(id: string): string {
  return `files/${id}`;
}
