export type AdminRoute =
  | { readonly name: "home" }
  | { readonly name: "login" }
  | { readonly name: "password" }
  | { readonly name: "device"; readonly userCode: string }
  | { readonly name: "api-key-new" }
  | { readonly name: "api-key"; readonly id: string }
  | { readonly name: "site-new" }
  | { readonly name: "site"; readonly id: string }
  | { readonly name: "unknown" };

export function parseAdminRoute(pathname: string, search: string): AdminRoute {
  const normalized = normalizePath(pathname);
  if (normalized !== "/admin" && !normalized.startsWith("/admin/")) {
    return { name: "unknown" };
  }
  const rest = normalized.slice("/admin".length).replace(/^\//, "");
  if (rest === "") return { name: "home" };
  const parts = rest.split("/");
  const head = parts[0];
  if (head === undefined) return { name: "unknown" };
  if (parts.length === 1 && head === "login") return { name: "login" };
  if (parts.length === 1 && head === "password") return { name: "password" };
  if (parts.length === 1 && head === "device") {
    return { name: "device", userCode: readUserCode(search) };
  }
  if (head === "api-keys" && parts.length === 2) {
    const id = decodeSegment(parts[1]);
    if (id === null) return { name: "unknown" };
    if (id === "new") return { name: "api-key-new" };
    return { name: "api-key", id };
  }
  if (head === "site-activations" && parts.length === 2) {
    const id = decodeSegment(parts[1]);
    if (id === null) return { name: "unknown" };
    if (id === "new") return { name: "site-new" };
    return { name: "site", id };
  }
  return { name: "unknown" };
}

export function hrefFor(route: AdminRoute): string {
  switch (route.name) {
    case "home":
      return "/admin/";
    case "login":
      return "/admin/login";
    case "password":
      return "/admin/password";
    case "device": {
      if (route.userCode === "") return "/admin/device";
      const query = new URLSearchParams({ user_code: route.userCode });
      return `/admin/device?${query.toString()}`;
    }
    case "api-key-new":
      return "/admin/api-keys/new";
    case "api-key":
      return `/admin/api-keys/${encodeURIComponent(route.id)}`;
    case "site-new":
      return "/admin/site-activations/new";
    case "site":
      return `/admin/site-activations/${encodeURIComponent(route.id)}`;
    case "unknown":
      return "/admin/";
  }
}

function normalizePath(pathname: string): string {
  const withLeading = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (withLeading.length === 1) return withLeading;
  return withLeading.replace(/\/+$/, "");
}

function decodeSegment(value: string | undefined): string | null {
  if (value === undefined || value === "" || value === "." || value === "..") return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded === "" || decoded.includes("/")) return null;
    return decoded;
  } catch {
    return null;
  }
}

function readUserCode(search: string): string {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return query.get("user_code") ?? "";
}
