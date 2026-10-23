// The Orbit O is drawn by hand in three places: docs/images/logo.svg (the official mark),
// packages/public-page/index.html (nav, hero, 理念, footer) and apps/admin/src/icons.ts.
// This test reads the geometry of every copy (core, ring radius and width, satellite positions
// and radii, mask holes) and compares it with the official file, so a hand edit cannot drift.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrbitMark } from "./icons";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const LOGO_GRADIENT = /<linearGradient\b[^>]*\bx1="64"[^>]*\by1="40"[^>]*\bx2="448"[^>]*\by2="472"/;
const TAG = /<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>/g;

type Frame = { tag: string; dx: number; dy: number; mask: boolean };

function attr(attributes: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes)?.[1];
}

/** Only plain translations may appear inside a mark; anything else would move the geometry. */
function translation(attributes: string): [number, number] {
  const transform = attr(attributes, "transform");
  if (transform === undefined) return [0, 0];
  const match = /^translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)$/.exec(transform.trim());
  if (match === null) throw new Error(`unexpected transform inside the mark: ${transform}`);
  return [Number(match[1]), Number(match[2])];
}

function fixed(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/**
 * Every Orbit O in an SVG/HTML document, as a sorted list of its circles in logo coordinates.
 * A mark is the element whose <defs> holds the logo gradient; translations from that element
 * down are applied, the glow copy of the core (it has a blur filter) is ignored.
 */
function marks(markup: string): string[][] {
  const found: string[][] = [];
  const stack: Frame[] = [];
  let root = -1;
  let circles: string[] = [];
  for (const match of markup.matchAll(TAG)) {
    const [, closing, rawTag, attributes = "", selfClosing] = match;
    const tag = (rawTag ?? "").toLowerCase();
    if (closing === "/") {
      stack.pop();
      if (root >= 0 && stack.length === root) {
        found.push(circles.sort());
        root = -1;
        circles = [];
      }
      continue;
    }
    if (root < 0 && tag === "lineargradient" && LOGO_GRADIENT.test(match[0])) {
      const defs = stack.map((frame) => frame.tag).lastIndexOf("defs");
      root = defs - 1;
      circles = [];
      for (const frame of stack.slice(root)) {
        frame.dx = 0;
        frame.dy = 0;
      }
    }
    const [dx, dy] = root >= 0 && stack.length > root ? translation(attributes) : [0, 0];
    const parent = stack[stack.length - 1];
    const frame: Frame = {
      tag,
      dx: (parent?.dx ?? 0) + dx,
      dy: (parent?.dy ?? 0) + dy,
      mask: tag === "mask" || (parent?.mask ?? false),
    };
    if (root >= 0 && tag === "circle" && attr(attributes, "filter") === undefined) {
      const cx = Number(attr(attributes, "cx")) + frame.dx;
      const cy = Number(attr(attributes, "cy")) + frame.dy;
      const r = fixed(Number(attr(attributes, "r")));
      const at = `${fixed(cx)},${fixed(cy)} r${r}`;
      const stroke = attr(attributes, "stroke");
      if (frame.mask) {
        circles.push(`hole ${at}`);
      } else if (stroke !== undefined && stroke !== "none") {
        circles.push(`ring ${at} w${String(attr(attributes, "stroke-width"))}`);
      } else {
        circles.push(`disc ${at}`);
      }
    }
    if (selfClosing !== "/") {
      stack.push(frame);
    }
  }
  return found;
}

const official = marks(readFileSync(path.join(repo, "docs/images/logo.svg"), "utf8"));

describe("Orbit O geometry", () => {
  it("reads the official mark", () => {
    expect(official).toHaveLength(1);
    expect(official[0]).toEqual(
      [
        "ring 256.0,256.0 r140.0 w52",
        "disc 256.0,256.0 r54.0",
        "disc 375.1,123.7 r34.0",
        "disc 316.9,423.3 r26.0",
        "disc 79.7,231.2 r20.0",
        "hole 375.1,123.7 r50.0",
        "hole 316.9,423.3 r42.0",
        "hole 79.7,231.2 r36.0",
      ].sort(),
    );
  });

  it("matches every mark on the public home page, hero and 理念 included", () => {
    const html = readFileSync(path.join(repo, "packages/public-page/index.html"), "utf8");
    const home = marks(html);
    // nav, hero, 理念 (the large one), and the two closing marks.
    expect(home.length).toBeGreaterThanOrEqual(4);
    for (const mark of home) {
      expect(mark).toEqual(official[0]);
    }
  });

  it("matches the admin marks, static and animated", () => {
    for (const animated of [false, true]) {
      const markup = renderToStaticMarkup(
        createElement(OrbitMark, { prefix: "t", size: 64, animated }),
      );
      const admin = marks(markup);
      expect(admin, `animated=${String(animated)}`).toEqual(official);
    }
  });
});
