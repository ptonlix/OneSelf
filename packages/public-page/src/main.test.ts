import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fillOrigin, siteOrigin, starEnvironment, startHome, wireCopyButtons } from "./main.ts";
import { startStars } from "./stars.ts";
import type { StarCanvas, StarContext } from "./stars.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fakeCanvas(
  stars = "40",
  size: { width: number; height: number } = { width: 300, height: 200 },
): { canvas: StarCanvas; fills: () => number; size: { width: number; height: number } } {
  let fills = 0;
  const context: StarContext = {
    setTransform: () => undefined,
    clearRect: () => undefined,
    beginPath: () => undefined,
    arc: () => undefined,
    fill: () => {
      fills += 1;
    },
    fillStyle: "",
  };
  return {
    canvas: {
      width: 0,
      height: 0,
      dataset: { stars },
      getBoundingClientRect: () => ({ ...size }),
      getContext: () => context,
    },
    fills: () => fills,
    size,
  };
}

function fakeWindow(reduce: boolean) {
  const frames: ((time: number) => void)[] = [];
  const observers: { callback: () => void; targets: unknown[]; connected: boolean }[] = [];
  class FakeResizeObserver {
    readonly entry: { callback: () => void; targets: unknown[]; connected: boolean };
    constructor(callback: () => void) {
      this.entry = { callback, targets: [], connected: true };
      observers.push(this.entry);
    }
    observe(target: unknown): void {
      this.entry.targets.push(target);
    }
    disconnect(): void {
      this.entry.connected = false;
    }
  }
  return {
    frames,
    observers,
    window: {
      devicePixelRatio: 2,
      matchMedia: (query: string) => ({
        matches: reduce && query === "(prefers-reduced-motion: reduce)",
      }),
      requestAnimationFrame: (callback: (time: number) => void) => frames.push(callback),
      cancelAnimationFrame: () => undefined,
      navigator: {},
      setTimeout: () => undefined,
      ResizeObserver: FakeResizeObserver,
    },
  };
}

function fakeDocument(hidden = false) {
  const listeners: (() => void)[] = [];
  return {
    listeners,
    document: {
      hidden,
      querySelectorAll: () => [],
      addEventListener: (_type: "visibilitychange", listener: () => void) => {
        listeners.push(listener);
      },
      removeEventListener: (_type: "visibilitychange", listener: () => void) => {
        const at = listeners.indexOf(listener);
        if (at >= 0) {
          listeners.splice(at, 1);
        }
      },
    },
  };
}

describe("home page script", () => {
  it("draws one frame and starts no animation loop when reduced motion is preferred", () => {
    const { window, frames } = fakeWindow(true);
    const { document, listeners } = fakeDocument();
    const sky = fakeCanvas();
    const handle = startStars([sky.canvas], starEnvironment(document, window));
    expect(sky.fills()).toBeGreaterThanOrEqual(40);
    expect(frames).toHaveLength(0);
    expect(listeners).toHaveLength(0);
    expect(handle.animating).toBe(false);
    expect(sky.canvas.width).toBe(600);
  });

  it("twinkles without reduced motion and stops while the page is hidden", () => {
    const { window, frames } = fakeWindow(false);
    const { document, listeners } = fakeDocument();
    const sky = fakeCanvas();
    const handle = startStars([sky.canvas], starEnvironment(document, window));
    expect(frames).toHaveLength(1);
    expect(handle.animating).toBe(true);
    document.hidden = true;
    for (const listener of listeners) {
      listener();
    }
    expect(handle.animating).toBe(false);
    document.hidden = false;
    for (const listener of listeners) {
      listener();
    }
    expect(handle.animating).toBe(true);
    handle.stop();
    expect(handle.animating).toBe(false);
  });

  it("removes its visibility listener and disconnects its resize observer on stop", () => {
    const { window, observers } = fakeWindow(false);
    const { document, listeners } = fakeDocument();
    const sky = fakeCanvas();
    const handle = startStars([sky.canvas], starEnvironment(document, window));
    expect(listeners).toHaveLength(1);
    expect(observers).toHaveLength(1);
    expect(observers[0]?.targets).toEqual([sky.canvas]);
    expect(observers[0]?.connected).toBe(true);
    handle.stop();
    expect(listeners).toHaveLength(0);
    expect(observers[0]?.connected).toBe(false);
    handle.stop();
    expect(listeners).toHaveLength(0);
  });

  it("re-lays out and redraws on resize and on a new pixel ratio", () => {
    const { window, observers } = fakeWindow(true);
    const sky = fakeCanvas();
    startStars([sky.canvas], starEnvironment(fakeDocument().document, window));
    expect(sky.canvas.width).toBe(600);
    const before = sky.fills();
    sky.size.width = 400;
    observers[0]?.callback();
    expect(sky.canvas.width).toBe(800);
    expect(sky.fills()).toBeGreaterThan(before);
    window.devicePixelRatio = 3;
    observers[0]?.callback();
    expect(sky.canvas.width).toBe(1200);
    expect(sky.canvas.height).toBe(600);
    const settled = sky.fills();
    observers[0]?.callback();
    expect(sky.fills()).toBe(settled);
  });

  it("draws nothing for a canvas with no size until it gets one", () => {
    const { window, observers } = fakeWindow(true);
    const sky = fakeCanvas("40", { width: 0, height: 0 });
    startStars([sky.canvas], starEnvironment(fakeDocument().document, window));
    expect(sky.fills()).toBe(0);
    expect(sky.canvas.width).toBe(0);
    sky.size.width = 100;
    sky.size.height = 50;
    observers[0]?.callback();
    expect(sky.fills()).toBeGreaterThanOrEqual(40);
    expect(sky.canvas.width).toBe(200);
  });

  it("draws the same sky for the same seed", () => {
    const styles = (): string[] => {
      const seen: string[] = [];
      const canvas = fakeCanvas("12").canvas;
      const context = canvas.getContext("2d");
      if (context === null) {
        throw new Error("no context");
      }
      context.fill = () => {
        seen.push(String(context.fillStyle));
      };
      const { window } = fakeWindow(true);
      startStars([canvas], starEnvironment(fakeDocument().document, window));
      return seen;
    };
    expect(styles()).toEqual(styles());
  });

  it("copies the command text as written (the no-origin fallback)", async () => {
    const written: string[] = [];
    let click: (() => void) | undefined;
    const label = { textContent: "复制" as string | null };
    const button = {
      dataset: { copy: "npx skills add https://<你的站点>" } as {
        copy?: string;
        copied?: string;
      },
      addEventListener: (_type: "click", listener: () => void) => {
        click = listener;
      },
      querySelector: () => label,
    };
    const { window } = fakeWindow(true);
    wireCopyButtons([button], {
      ...window,
      navigator: {
        clipboard: {
          writeText: (text: string) => {
            written.push(text);
            return Promise.resolve();
          },
        },
      },
    });
    click?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(written).toEqual(["npx skills add https://<你的站点>"]);
    expect(label.textContent).toBe("已复制");
  });

  it("uses the page origin only for real http(s) pages", () => {
    expect(siteOrigin({ origin: "http://127.0.0.1:3000", protocol: "http:" })).toBe(
      "http://127.0.0.1:3000",
    );
    expect(siteOrigin({ origin: "https://me.example", protocol: "https:" })).toBe(
      "https://me.example",
    );
    expect(siteOrigin({ origin: "null", protocol: "file:" })).toBeNull();
    expect(siteOrigin({ origin: "null", protocol: "https:" })).toBeNull();
    expect(siteOrigin(undefined)).toBeNull();
  });

  it("fills marked addresses with the origin, not the preview path", () => {
    const texts = [
      { dataset: { origin: "" }, textContent: "https://<你的站点>" as string | null },
      { dataset: { origin: "/.well-known/pcp" }, textContent: "/.well-known/pcp" as string | null },
      { dataset: { origin: "/mcp" }, textContent: "/mcp" as string | null },
    ];
    const copies = [
      {
        dataset: {
          copy: "npx skills add https://<你的站点>",
          originCopy: "npx skills add {origin}",
        },
      },
      { dataset: { copy: "/.well-known/pcp", originCopy: "{origin}/.well-known/pcp" } },
    ];
    const hint = { hidden: false };
    fillOrigin("http://127.0.0.1:3000", { texts, copies, fallbacks: [hint] });
    expect(texts.map((text) => text.textContent)).toEqual([
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3000/.well-known/pcp",
      "http://127.0.0.1:3000/mcp",
    ]);
    expect(copies.map((copy) => copy.dataset.copy)).toEqual([
      "npx skills add http://127.0.0.1:3000",
      "http://127.0.0.1:3000/.well-known/pcp",
    ]);
    expect(hint.hidden).toBe(true);
  });

  it("copies the filled address when the page has an origin", async () => {
    const page = homePage({ origin: "http://127.0.0.1:3000", protocol: "http:" });
    page.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(page.written).toEqual(["npx skills add http://127.0.0.1:3000"]);
    expect(page.command.textContent).toBe("http://127.0.0.1:3000");
    expect(page.hint.hidden).toBe(true);
  });

  it("keeps the placeholder on a file:// page", async () => {
    const page = homePage({ origin: "null", protocol: "file:" });
    page.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(page.written).toEqual(["npx skills add https://<你的站点>"]);
    expect(page.command.textContent).toBe("https://<你的站点>");
    expect(page.hint.hidden).toBe(false);
  });

  it("does not read any profile data or reference domain, db, or a resume route", () => {
    const files = walk(root).filter((file) => !file.endsWith(".test.ts"));
    const forbidden =
      /@oneself\/public-client|\bfetch\b|\/pcp\/v1\/public\/|\/media\/|@oneself\/(domain|db|adapters)|packages\/(domain|db|adapters)|\/resume|history\.pushState|appType:\s*"spa"/;
    for (const file of files.filter((file) => !file.endsWith("index.html"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(forbidden);
    }
    const html = readFileSync(path.join(root, "index.html"), "utf8");
    expect(html).not.toMatch(/@oneself\/public-client|\bfetch\(|\/resume|packages\/(domain|db)/);
    const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.["@oneself/public-client"]).toBeUndefined();
    const config = readFileSync(path.join(root, "vite.config.js"), "utf8");
    expect(config).toContain('appType: "mpa"');
    expect(config).toContain('base: "./"');
  });
});

function homePage(location: { origin: string; protocol: string }) {
  const written: string[] = [];
  let click: (() => void) | undefined;
  const command = { dataset: { origin: "" }, textContent: "https://<你的站点>" as string | null };
  const hint = { hidden: false };
  const button = {
    dataset: {
      copy: "npx skills add https://<你的站点>",
      originCopy: "npx skills add {origin}",
    } as {
      copy?: string;
      copied?: string;
      originCopy?: string;
    },
    addEventListener: (_type: "click", listener: () => void) => {
      click = listener;
    },
    querySelector: () => ({ textContent: "复制" as string | null }),
  };
  const elements: Record<string, unknown[]> = {
    "[data-origin]": [command],
    "[data-origin-copy]": [button],
    "[data-origin-fallback]": [hint],
    "button[data-copy]": [button],
  };
  const { window } = fakeWindow(true);
  startHome(
    {
      hidden: false,
      querySelectorAll: (selector: string) => elements[selector] ?? [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    {
      ...window,
      location,
      navigator: {
        clipboard: {
          writeText: (text: string) => {
            written.push(text);
            return Promise.resolve();
          },
        },
      },
    },
  );
  return {
    written,
    command,
    hint,
    click: () => {
      click?.();
    },
  };
}

function walk(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|js|html|css|json)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}
