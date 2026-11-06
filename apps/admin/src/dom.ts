type SkyCanvas = {
  getBoundingClientRect(): { width: number; height: number; left: number; top: number };
};

export function readPixelRatio(): number {
  const value = (globalThis as { devicePixelRatio?: unknown }).devicePixelRatio;
  return typeof value === "number" ? value : 1;
}

export function readReducedMotion(): boolean {
  const match = (globalThis as { matchMedia?: unknown }).matchMedia;
  if (typeof match !== "function") return false;
  const query = (match as (value: string) => { matches?: unknown }).call(
    globalThis,
    "(prefers-reduced-motion: reduce)",
  );
  return query.matches === true;
}

export function readLabels(): object | null {
  const document = (globalThis as { document?: { querySelector?: unknown } }).document;
  const query = document?.querySelector;
  if (typeof query !== "function") return null;
  const found = (query as (selector: string) => unknown).call(document, ".nebula-labels");
  return found !== null && typeof found === "object" ? found : null;
}

function readSky(): object | null {
  const document = (globalThis as { document?: { querySelector?: unknown } }).document;
  const query = document?.querySelector;
  if (typeof query !== "function") return null;
  const found = (query as (selector: string) => unknown).call(document, ".nebula-sky");
  return found !== null && typeof found === "object" ? found : null;
}

/** Pinch zoom is a ctrl+wheel. A passive listener cannot cancel it, so the browser zooms the page instead of the sky. */
export function holdSkyZoom(
  onPinch: (delta: number) => void,
  onGesture: (active: boolean) => void,
): () => void {
  const sky = readSky();
  if (sky === null) return () => undefined;
  let scale = 1;
  const wheel = (event: { preventDefault(): void }): void => {
    event.preventDefault();
  };
  const start = (event: { preventDefault(): void }): void => {
    event.preventDefault();
    scale = 1;
    onGesture(true);
  };
  const change = (event: { preventDefault(): void; scale?: unknown }): void => {
    event.preventDefault();
    if (typeof event.scale !== "number") return;
    onPinch((scale - event.scale) * 240);
    scale = event.scale;
  };
  const end = (event: { preventDefault(): void }): void => {
    event.preventDefault();
    onGesture(false);
  };
  const stops = [
    listen(sky, "wheel", wheel, { capture: true, passive: false }),
    listen(sky, "gesturestart", start, { passive: false }),
    listen(sky, "gesturechange", change, { passive: false }),
    listen(sky, "gestureend", end, { passive: false }),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}

type ZoomListener = (event: { preventDefault(): void; scale?: unknown }) => void;

function listen(target: object, type: string, listener: ZoomListener, options: object): () => void {
  const add = (target as { addEventListener?: unknown }).addEventListener;
  const remove = (target as { removeEventListener?: unknown }).removeEventListener;
  if (typeof add !== "function" || typeof remove !== "function") return () => undefined;
  const addEvent = add as (type: string, listener: ZoomListener, options: object) => void;
  const removeEvent = remove as (type: string, listener: ZoomListener, options: object) => void;
  addEvent.call(target, type, listener, options);
  return () => {
    removeEvent.call(target, type, listener, options);
  };
}

export function readCanvas(): SkyCanvas | null {
  const document = (globalThis as { document?: { querySelector?: unknown } }).document;
  const query = document?.querySelector;
  if (typeof query !== "function") return null;
  const found = (query as (selector: string) => unknown).call(document, ".nebula-canvas");
  if (found === null || typeof found !== "object" || !("getBoundingClientRect" in found))
    return null;
  return found as SkyCanvas;
}

export function canUseWebGL(): boolean {
  const document = (globalThis as { document?: { createElement?: unknown } }).document;
  const create = document?.createElement;
  if (typeof create !== "function") return false;
  const canvas = (create as (tag: string) => { getContext?: unknown }).call(document, "canvas");
  const getContext = canvas.getContext;
  if (typeof getContext !== "function") return false;
  const read = getContext as (type: string) => unknown;
  return read.call(canvas, "webgl2") !== null || read.call(canvas, "webgl") !== null;
}

export function frame(callback: (now: number) => void): number {
  const request = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  if (typeof request !== "function") return 0;
  return (request as (cb: (now: number) => void) => number).call(globalThis, callback);
}

export function cancelFrame(id: number): void {
  const cancel = (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
  if (typeof cancel === "function") (cancel as (value: number) => void).call(globalThis, id);
}

export function observeSize(target: object, onSize: () => void): { disconnect(): void } {
  const Observer = (
    globalThis as {
      ResizeObserver?: new (cb: () => void) => { observe(t: object): void; disconnect(): void };
    }
  ).ResizeObserver;
  if (Observer === undefined) return { disconnect() {} };
  const observer = new Observer(onSize);
  observer.observe(target);
  return observer;
}

export function now(): number {
  return Date.now();
}

/** Keeps later pointerup and pointercancel on the sky when the pointer is released outside it. */
export function capturePointer(target: EventTarget | null, pointerId: number): void {
  if (target === null || typeof target !== "object" || !("setPointerCapture" in target)) return;
  const capture = target.setPointerCapture;
  if (typeof capture !== "function") return;
  try {
    (capture as (id: number) => void).call(target, pointerId);
  } catch {
    return;
  }
}

export function pointerOutside(target: EventTarget | null, x: number, y: number): boolean {
  if (target === null || typeof target !== "object" || !("getBoundingClientRect" in target))
    return false;
  const read = target.getBoundingClientRect;
  if (typeof read !== "function") return false;
  const rect = (read as () => { left: number; right: number; top: number; bottom: number }).call(
    target,
  );
  return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
}
