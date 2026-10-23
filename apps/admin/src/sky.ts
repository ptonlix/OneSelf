import { createElement, useEffect, useRef, type ReactElement } from "react";
import { startStars, type StarCanvas, type StarEnvironment } from "./stars";

// Starfield behind the login and password screens. The working screens have no sky (decision 11).

function browserEnvironment(): StarEnvironment | null {
  const view = globalThis as {
    document?: {
      hidden: boolean;
      addEventListener(type: string, listener: () => void): void;
      removeEventListener(type: string, listener: () => void): void;
    };
    ResizeObserver?: new (callback: () => void) => {
      observe(target: StarCanvas): void;
      disconnect(): void;
    };
    devicePixelRatio?: number;
    matchMedia?: (query: string) => { matches: boolean };
    requestAnimationFrame?: (callback: (time: number) => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  const doc = view.document;
  if (doc === undefined || typeof view.requestAnimationFrame !== "function") return null;
  return {
    pixelRatio: () => view.devicePixelRatio ?? 1,
    reducedMotion: () =>
      typeof view.matchMedia === "function" &&
      view.matchMedia("(prefers-reduced-motion: reduce)").matches,
    hidden: () => doc.hidden,
    onVisibilityChange: (listener) => {
      doc.addEventListener("visibilitychange", listener);
      return () => {
        doc.removeEventListener("visibilitychange", listener);
      };
    },
    onResize: (canvases, listener) => {
      const Observer = view.ResizeObserver;
      if (Observer === undefined) return () => undefined;
      const observer = new Observer(listener);
      for (const canvas of canvases) observer.observe(canvas);
      return () => {
        observer.disconnect();
      };
    },
    requestFrame: (callback) => view.requestAnimationFrame?.(callback) ?? 0,
    cancelFrame: (handle) => {
      view.cancelAnimationFrame?.(handle);
    },
  };
}

export function Sky(props: { stars: number }): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const environment = browserEnvironment();
    if (canvas === null || environment === null) return undefined;
    const handle = startStars([canvas as unknown as StarCanvas], environment);
    return () => {
      handle.stop();
    };
  }, []);
  return createElement(
    "div",
    { className: "sky", "aria-hidden": "true" },
    createElement("canvas", { ref, "data-stars": String(props.stars), "aria-hidden": "true" }),
  );
}
