/** Originals accepted by `file_upload`. Discovery and OpenAPI read these, not copies. */
export const FILE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function isFileMediaType(value: string): boolean {
  return FILE_MEDIA_TYPES.some((mediaType) => mediaType === value);
}
