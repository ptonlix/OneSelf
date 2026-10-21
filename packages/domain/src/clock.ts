/** Soft-deleted pages and sources stay restorable until this duration has been exceeded. */
export const SOFT_DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Unreferenced objects survive this long after the last pointer disappears. */
export const UNREFERENCED_OBJECT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const SITE_ACTIVATION_TTL_MS = 15 * 60 * 1000;

export function timestampMs(iso: string): number | null {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

export function addMilliseconds(iso: string, milliseconds: number): string | null {
  const parsed = timestampMs(iso);
  if (parsed === null) {
    return null;
  }
  return new Date(parsed + milliseconds).toISOString();
}

/** True only after the retention window. An equal timestamp is still inside the window. */
export function isPastRetention(startIso: string, nowIso: string, retentionMs: number): boolean {
  const start = timestampMs(startIso);
  const now = timestampMs(nowIso);
  if (start === null || now === null) {
    return false;
  }
  return now - start > retentionMs;
}
