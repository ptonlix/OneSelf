import "./brand.css";
import "./styles.css";
import { startStars } from "./stars.ts";
import type { StarCanvas, StarEnvironment } from "./stars.ts";

// The home page is static HTML. This script adds the starfield, the copy buttons and the
// site address: the install command and the discovery address carry `data-origin="/path"` and
// show `location.origin` + path, so the visitor sees the address they actually used (also under
// /_preview/public-page/, because the origin does not include the path). Without the script, or on a file:// page whose origin is
// "null", the HTML keeps its placeholder and bare paths. The served HTML never changes.

type CopyButton = {
  readonly dataset: { copy?: string | undefined; copied?: string | undefined };
  addEventListener(type: "click", listener: () => void): void;
  querySelector(selector: string): { textContent: string | null } | null;
};

type OriginText = {
  readonly dataset: { origin?: string | undefined };
  textContent: string | null;
};

type OriginCopy = {
  readonly dataset: { copy?: string | undefined; originCopy?: string | undefined };
};

type OriginFallback = { hidden: boolean };

type HomeLocation = { origin: string; protocol: string };

type HomeDocument = {
  hidden: boolean;
  querySelectorAll(selector: string): ArrayLike<unknown>;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

type ResizeWatcher = {
  observe(target: StarCanvas): void;
  disconnect(): void;
};

type HomeWindow = {
  devicePixelRatio: number;
  matchMedia?: ((query: string) => { matches: boolean }) | undefined;
  requestAnimationFrame(callback: (time: number) => void): number;
  cancelAnimationFrame(handle: number): void;
  navigator: { clipboard?: { writeText(text: string): Promise<void> } | undefined };
  setTimeout(callback: () => void, delay: number): unknown;
  location?: HomeLocation | undefined;
  ResizeObserver?: (new (callback: () => void) => ResizeWatcher) | undefined;
};

export function starEnvironment(document: HomeDocument, window: HomeWindow): StarEnvironment {
  return {
    pixelRatio: () => window.devicePixelRatio,
    reducedMotion: () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    hidden: () => document.hidden,
    onVisibilityChange: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => {
        document.removeEventListener("visibilitychange", listener);
      };
    },
    onResize: (canvases, listener) => {
      const Observer = window.ResizeObserver;
      if (Observer === undefined) {
        return () => undefined;
      }
      const observer = new Observer(listener);
      for (const canvas of canvases) {
        observer.observe(canvas);
      }
      return () => {
        observer.disconnect();
      };
    },
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => {
      window.cancelAnimationFrame(handle);
    },
  };
}

export function wireCopyButtons(buttons: readonly CopyButton[], window: HomeWindow): void {
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const text = button.dataset.copy;
      const clipboard = window.navigator.clipboard;
      if (text === undefined || clipboard === undefined) {
        return;
      }
      clipboard.writeText(text).then(
        () => {
          const label = button.querySelector("[data-copy-label]");
          const before = label?.textContent ?? null;
          button.dataset.copied = "";
          if (label !== null) {
            label.textContent = "已复制";
          }
          window.setTimeout(() => {
            delete button.dataset.copied;
            if (label !== null) {
              label.textContent = before;
            }
          }, 1600);
        },
        () => undefined,
      );
    });
  }
}

/** The address to show, or null when there is no real http(s) origin (file://, sandboxed). */
export function siteOrigin(location: HomeLocation | undefined): string | null {
  if (location === undefined) {
    return null;
  }
  if (location.protocol !== "http:" && location.protocol !== "https:") {
    return null;
  }
  if (location.origin === "" || location.origin === "null") {
    return null;
  }
  return location.origin;
}

/** Writes the origin into marked text and copy buttons, and hides the "replace it" hint. */
export function fillOrigin(
  origin: string,
  targets: {
    texts: readonly OriginText[];
    copies: readonly OriginCopy[];
    fallbacks: readonly OriginFallback[];
  },
): void {
  for (const text of targets.texts) {
    const path = text.dataset.origin;
    if (path !== undefined) {
      text.textContent = `${origin}${path}`;
    }
  }
  for (const copy of targets.copies) {
    const template = copy.dataset.originCopy;
    if (template !== undefined) {
      copy.dataset.copy = template.split("{origin}").join(origin);
    }
  }
  for (const fallback of targets.fallbacks) {
    fallback.hidden = true;
  }
}

export function startHome(document: HomeDocument, window: HomeWindow): void {
  const origin = siteOrigin(window.location);
  if (origin !== null) {
    fillOrigin(origin, {
      texts: Array.from(document.querySelectorAll("[data-origin]")) as OriginText[],
      copies: Array.from(document.querySelectorAll("[data-origin-copy]")) as OriginCopy[],
      fallbacks: Array.from(
        document.querySelectorAll("[data-origin-fallback]"),
      ) as OriginFallback[],
    });
  }
  const canvases = Array.from(document.querySelectorAll("canvas[data-stars]")) as StarCanvas[];
  startStars(canvases, starEnvironment(document, window));
  wireCopyButtons(
    Array.from(document.querySelectorAll("button[data-copy]")) as CopyButton[],
    window,
  );
}

const scope = globalThis as { document?: HomeDocument; window?: HomeWindow };
if (scope.document !== undefined && scope.window !== undefined) {
  startHome(scope.document, scope.window);
}
