/** Business directory name. The primary key is this name; it does not mean public or private. */
export const SOURCE_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

/** Page slug. Slashes are excluded so a page id cannot encode a path. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export const PRELOADED_SOURCE_NAMES = ["public", "private", "agents"] as const;

export function isSourceName(value: string): boolean {
  return SOURCE_PATTERN.test(value);
}

export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value) && !value.includes("/");
}

export function isTypeName(value: string): boolean {
  return SOURCE_PATTERN.test(value);
}
