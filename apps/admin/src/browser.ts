export function readInputValue(target: EventTarget | null): string {
  const value = readProp(target, "value");
  return typeof value === "string" ? value : "";
}

export function readInputChecked(target: EventTarget | null): boolean {
  return readProp(target, "checked") === true;
}

export function readBrowserLocation(): { pathname: string; search: string } {
  const location = readGlobal("location");
  return {
    pathname: typeof location.pathname === "string" ? location.pathname : "/admin/",
    search: typeof location.search === "string" ? location.search : "",
  };
}

export function pushBrowserPath(url: string): void {
  const history = readGlobal("history");
  const pushState = history.pushState;
  if (typeof pushState !== "function") return;
  const push = pushState as (this: unknown, data: null, unused: string, next: string) => void;
  push.call(history.target, null, "", url);
}

export function subscribeToLocation(onChange: () => void): () => void {
  const target = globalThis as { addEventListener?: unknown; removeEventListener?: unknown };
  const add = target.addEventListener;
  const remove = target.removeEventListener;
  if (typeof add !== "function" || typeof remove !== "function") return () => undefined;
  const addEvent = add as (this: unknown, type: string, listener: () => void) => void;
  const removeEvent = remove as (this: unknown, type: string, listener: () => void) => void;
  addEvent.call(globalThis, "popstate", onChange);
  return () => {
    removeEvent.call(globalThis, "popstate", onChange);
  };
}

export function readRootElement(): HTMLElement {
  const document = readGlobal("document");
  const getElementById = document.getElementById;
  if (typeof getElementById !== "function") throw new Error("缺少 #root");
  const read = getElementById as (this: unknown, id: string) => unknown;
  const found = read.call(document.target, "root");
  if (!isElement(found)) throw new Error("缺少 #root");
  return found;
}

function isElement(value: unknown): value is HTMLElement {
  return typeof value === "object" && value !== null;
}

function readProp(target: EventTarget | null, key: string): unknown {
  if (target === null || typeof target !== "object") return undefined;
  if (!(key in target)) return undefined;
  const record = target as unknown as Record<string, unknown>;
  return record[key];
}

function readGlobal(key: "location" | "history" | "document"): {
  target: object;
  pathname?: unknown;
  search?: unknown;
  pushState?: unknown;
  getElementById?: unknown;
} {
  const candidate = (globalThis as Record<string, unknown>)[key];
  if (typeof candidate !== "object" || candidate === null) return { target: {} };
  const record = candidate as Record<string, unknown>;
  return {
    target: candidate,
    pathname: record.pathname,
    search: record.search,
    pushState: record.pushState,
    getElementById: record.getElementById,
  };
}
