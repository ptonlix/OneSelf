// Seeded starfield for the built-in home page and the admin login screens (design.md decision 11).
// packages/public-page/src/stars.ts and apps/admin/src/stars.ts are the same file;
// apps/admin/src/brand.test.ts keeps them byte-identical.
// Same seed, same sky: the stars are drawn on <canvas data-stars="N" aria-hidden="true">.
// Motion only changes opacity. It stops while the page is hidden and never starts
// when the visitor prefers reduced motion; then exactly one frame is drawn.
// A resized canvas (or a new device pixel ratio) is re-laid out and redrawn; a canvas with no
// size draws nothing until it gets one. stop() removes every listener and observer it added.

export type StarCanvas = {
  width: number;
  height: number;
  readonly dataset: { stars?: string | undefined };
  getBoundingClientRect(): { width: number; height: number };
  getContext(kind: "2d"): StarContext | null;
};

export type StarContext = {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  fill(): void;
  fillStyle: unknown;
};

export type StarEnvironment = {
  /** Read on every layout, so zooming or moving to another screen keeps the stars sharp. */
  pixelRatio(): number;
  reducedMotion(): boolean;
  hidden(): boolean;
  /** Adds the listener and returns the function that removes it. */
  onVisibilityChange(listener: () => void): () => void;
  /** Watches the canvases' boxes (a ResizeObserver) and returns the function that disconnects it. */
  onResize(canvases: readonly StarCanvas[], listener: () => void): () => void;
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(handle: number): void;
};

type Star = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  colour: string;
  halo: boolean;
  phase: number;
  speed: number;
};

type Sky = {
  canvas: StarCanvas;
  context: StarContext;
  index: number;
  stars: Star[];
  width: number;
  height: number;
  ratio: number;
};

export type StarsHandle = {
  readonly animating: boolean;
  stop(): void;
};

const COLOURS = ["94,234,212", "192,132,252", "147,168,251", "238,240,251"];

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function colourFor(value: number): string {
  if (value < 0.2) {
    return COLOURS[0] ?? "";
  }
  if (value < 0.4) {
    return COLOURS[1] ?? "";
  }
  if (value < 0.55) {
    return COLOURS[2] ?? "";
  }
  return COLOURS[3] ?? "";
}

function prepare(canvas: StarCanvas, index: number, ratio: number): Sky | null {
  const context = canvas.getContext("2d");
  if (context === null) {
    return null;
  }
  const sky: Sky = { canvas, context, index, stars: [], width: -1, height: -1, ratio: 0 };
  layout(sky, ratio);
  return sky;
}

/** Sizes the backing store for the box and ratio; returns false when nothing changed. */
function layout(sky: Sky, pixelRatio: number): boolean {
  const { canvas, context } = sky;
  const box = canvas.getBoundingClientRect();
  const width = Number.isFinite(box.width) && box.width > 0 ? box.width : 0;
  const height = Number.isFinite(box.height) && box.height > 0 ? box.height : 0;
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  if (width === sky.width && height === sky.height && ratio === sky.ratio) {
    return false;
  }
  sky.width = width;
  sky.height = height;
  sky.ratio = ratio;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  if (width === 0 || height === 0) {
    // Hidden or collapsed: nothing to draw until a resize gives the canvas a box.
    sky.stars = [];
    return true;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const count = Number.parseInt(canvas.dataset.stars ?? "", 10);
  const rand = seeded(1234 + sky.index * 77);
  const stars: Star[] = [];
  for (let i = 0; i < (Number.isFinite(count) && count > 0 ? count : 260); i += 1) {
    const x = rand() * width;
    const y = rand() * height;
    const size = rand();
    const alpha = 0.15 + rand() * 0.65;
    const colour = colourFor(rand());
    stars.push({
      x,
      y,
      radius: size > 0.985 ? 1.6 : size > 0.9 ? 1.05 : 0.6,
      alpha,
      colour,
      halo: size > 0.992,
      phase: rand() * Math.PI * 2,
      speed: 0.4 + rand() * 0.9,
    });
  }
  sky.stars = stars;
  return true;
}

function draw(sky: Sky, time: number | null): void {
  if (sky.width === 0 || sky.height === 0) {
    return;
  }
  const { context } = sky;
  context.clearRect(0, 0, sky.width, sky.height);
  for (const star of sky.stars) {
    // Only the larger stars twinkle; the small ones stay put so the sky reads as still.
    const twinkle =
      time === null || star.radius < 1
        ? 1
        : 0.55 + 0.45 * Math.sin(star.phase + (time / 1000) * star.speed);
    context.beginPath();
    context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    context.fillStyle = `rgba(${star.colour},${(star.alpha * twinkle).toFixed(3)})`;
    context.fill();
    if (star.halo) {
      context.fillStyle = `rgba(${star.colour},0.08)`;
      context.beginPath();
      context.arc(star.x, star.y, 5, 0, Math.PI * 2);
      context.fill();
    }
  }
}

export function startStars(
  canvases: readonly StarCanvas[],
  environment: StarEnvironment,
): StarsHandle {
  const skies: Sky[] = [];
  canvases.forEach((canvas, index) => {
    const sky = prepare(canvas, index, environment.pixelRatio());
    if (sky !== null) {
      skies.push(sky);
      draw(sky, null);
    }
  });
  let frame: number | null = null;
  let stopped = false;
  let lastTime: number | null = null;
  const still = environment.reducedMotion();
  const cleanups: (() => void)[] = [];

  const tick = (time: number): void => {
    frame = null;
    if (stopped || environment.hidden()) {
      return;
    }
    lastTime = time;
    for (const sky of skies) {
      draw(sky, time);
    }
    frame = environment.requestFrame(tick);
  };

  const resume = (): void => {
    if (still || stopped || frame !== null || skies.length === 0 || environment.hidden()) {
      return;
    }
    frame = environment.requestFrame(tick);
  };

  if (skies.length > 0) {
    cleanups.push(
      environment.onResize(
        skies.map((sky) => sky.canvas),
        () => {
          if (stopped) {
            return;
          }
          const ratio = environment.pixelRatio();
          for (const sky of skies) {
            // Resizing clears the backing store, so redraw at once instead of waiting a frame.
            if (layout(sky, ratio)) {
              draw(sky, still ? null : lastTime);
            }
          }
        },
      ),
    );
  }

  if (!still) {
    cleanups.push(
      environment.onVisibilityChange(() => {
        if (environment.hidden()) {
          if (frame !== null) {
            environment.cancelFrame(frame);
            frame = null;
          }
          return;
        }
        resume();
      }),
    );
    resume();
  }

  return {
    get animating() {
      return frame !== null;
    },
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      if (frame !== null) {
        environment.cancelFrame(frame);
        frame = null;
      }
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
    },
  };
}
