// Inline SVG for the admin: the official Orbit O (docs/images/logo.svg), line icons and the
// decorative orbit drawings. Every mark gets an id prefix so several can share one page.
import { createElement, type ReactElement, type ReactNode } from "react";

type SvgProps = Record<string, string | number | undefined>;

function s(tag: string, props: SvgProps | null, ...children: ReactNode[]): ReactElement {
  return createElement(tag, props, ...children);
}

const MARK_HOLES: readonly (readonly [number, number, number])[] = [
  [375.1, 123.7, 50],
  [316.9, 423.3, 42],
  [79.7, 231.2, 36],
];
const MARK_MOONS: readonly (readonly [number, number, number])[] = [
  [375.1, 123.7, 34],
  [316.9, 423.3, 26],
  [79.7, 231.2, 20],
];

function markParts(prefix: string, animated = false): ReactElement[] {
  const gradient = `${prefix}-g`;
  const mask = `${prefix}-m`;
  const gradientDef = s(
    "linearGradient",
    { id: gradient, gradientUnits: "userSpaceOnUse", x1: 64, y1: 40, x2: 448, y2: 472 },
    s("stop", { offset: "0", stopColor: "#2DD4BF" }),
    s("stop", { offset: "0.55", stopColor: "#6D8BF8" }),
    s("stop", { offset: "1", stopColor: "#A855F7" }),
  );
  if (animated) return animatedMarkParts(prefix, gradientDef);
  return [
    s(
      "defs",
      { key: "defs" },
      gradientDef,
      s(
        "mask",
        { id: mask, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 512, height: 512 },
        s("rect", { width: 512, height: 512, fill: "#fff" }),
        ...MARK_HOLES.map(([cx, cy, r]) => s("circle", { key: `${cx}`, cx, cy, r, fill: "#000" })),
      ),
    ),
    s("circle", {
      key: "ring",
      cx: 256,
      cy: 256,
      r: 140,
      fill: "none",
      stroke: `url(#${gradient})`,
      strokeWidth: 52,
      mask: `url(#${mask})`,
    }),
    s("circle", { key: "core", cx: 256, cy: 256, r: 54, fill: `url(#${gradient})` }),
    ...MARK_MOONS.map(([cx, cy, r]) =>
      s("circle", { key: `moon-${cx}`, cx, cy, r, fill: `url(#${gradient})` }),
    ),
  ];
}

const TO_CENTRE = "translate(-256 -256)";
const AT_CENTRE = "translate(256 256)";

/** One satellite track: the moon (or its mask hole) turns about the logo centre (decision 22). */
function satellite(index: number, child: ReactElement): ReactElement {
  return s("g", { key: `o${String(index)}`, className: `logo-orbit o${String(index + 1)}` }, child);
}

/**
 * The large Orbit O in motion, as on the home page: each satellite (and its hole in the ring)
 * orbits at its own speed, the ring gradient turns slowly, the core breathes with a soft glow.
 * Every moving group sits at the logo centre so it turns about its own origin.
 */
function animatedMarkParts(prefix: string, gradientDef: ReactElement): ReactElement[] {
  const fill = `url(#${prefix}-g)`;
  const mask = `${prefix}-m`;
  const glow = `${prefix}-c`;
  return [
    s(
      "defs",
      { key: "defs" },
      gradientDef,
      s(
        "mask",
        { id: mask, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 512, height: 512 },
        s("rect", { width: 512, height: 512, fill: "#fff" }),
        s(
          "g",
          { transform: AT_CENTRE },
          ...MARK_HOLES.map(([cx, cy, r], index) =>
            satellite(index, s("circle", { cx: cx - 256, cy: cy - 256, r, fill: "#000" })),
          ),
        ),
      ),
      s(
        "filter",
        { id: glow, x: "-100%", y: "-100%", width: "300%", height: "300%" },
        s("feGaussianBlur", { stdDeviation: 16 }),
      ),
    ),
    s(
      "g",
      { key: "ring", mask: `url(#${mask})` },
      s(
        "g",
        { transform: AT_CENTRE },
        s(
          "g",
          { className: "logo-ring" },
          s("circle", {
            transform: TO_CENTRE,
            cx: 256,
            cy: 256,
            r: 140,
            fill: "none",
            stroke: fill,
            strokeWidth: 52,
          }),
        ),
      ),
    ),
    s(
      "g",
      { key: "body", transform: AT_CENTRE },
      s(
        "g",
        { className: "logo-core" },
        s("circle", {
          className: "logo-glow",
          transform: TO_CENTRE,
          cx: 256,
          cy: 256,
          r: 54,
          fill,
          filter: `url(#${glow})`,
          opacity: 0,
        }),
        s("circle", { transform: TO_CENTRE, cx: 256, cy: 256, r: 54, fill }),
      ),
      ...MARK_MOONS.map(([cx, cy, r], index) =>
        satellite(index, s("circle", { transform: TO_CENTRE, cx, cy, r, fill })),
      ),
    ),
  ];
}

/** The Orbit O. `label` makes it an image for screen readers; without it, it is decorative. */
export function OrbitMark(props: {
  prefix: string;
  size: number;
  label?: string;
  animated?: boolean;
}): ReactElement {
  return s(
    "svg",
    {
      width: props.size,
      height: props.size,
      viewBox: "0 0 512 512",
      ...(props.label === undefined
        ? { "aria-hidden": "true" }
        : { role: "img", "aria-label": props.label }),
    },
    ...markParts(props.prefix, props.animated === true),
  );
}

const ICON_PATHS = {
  home: ["M4 11 12 4l8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5z"],
  device: [
    "M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5z",
    "M10.5 18h3",
  ],
  key: ["M12 15a4 4 0 1 1-8 0 4 4 0 0 1 8 0z", "m11 12 9-9m-4 4 3 3"],
  globe: [
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  ],
  lock: [
    "M7.5 10.5h9a2.5 2.5 0 0 1 2.5 2.5v4.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 17.5V13a2.5 2.5 0 0 1 2.5-2.5z",
    "M8 10.5V7.5a4 4 0 0 1 8 0v3",
  ],
  logout: ["M15 4h3.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 8l-4 4 4 4M6 12h10"],
  external: ["M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  arrow: ["M5 12h14M13 6l6 6-6 6"],
  copy: [
    "M11 8.5h6a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5h-6A2.5 2.5 0 0 1 8.5 17v-6A2.5 2.5 0 0 1 11 8.5z",
    "M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5",
  ],
  shield: ["M12 3 5 6v5.5c0 4.5 3 7.8 7 9.5 4-1.7 7-5 7-9.5V6z", "m9 12 2 2 4-4"],
  info: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", "M12 11v5M12 8h.01"],
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon(props: { name: IconName; size?: number }): ReactElement {
  const size = props.size ?? 17;
  return s(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
    },
    ...ICON_PATHS[props.name].map((d) => s("path", { key: d, d })),
  );
}

const DOT_COLOURS = ["#5eead4", "#7dd3fc", "#93a8fb", "#c084fc"] as const;

/** Stable colour per position, the same order the mockups use. */
function sourceColour(index: number): string {
  return DOT_COLOURS[index % DOT_COLOURS.length] ?? "#93a8fb";
}

export interface OrbitSource {
  id: string;
  caption: string;
  isPublic: boolean;
}

/** Overview drawing: the mark in the middle and each source as a satellite on one tilted orbit. */
export function SourceOrbit(props: { sources: readonly OrbitSource[] }): ReactElement {
  const shown = props.sources.slice(0, 8);
  const cx = 260;
  const cy = 150;
  const nodes = shown.map((source, index) => {
    const angle = -Math.PI * 0.82 + (index * Math.PI * 2) / Math.max(shown.length, 1);
    const x = Math.round(cx + 175 * Math.cos(angle));
    const y = Math.round(cy + 92 * Math.sin(angle));
    const colour = sourceColour(index);
    const above = y < cy;
    return s(
      "g",
      { key: source.id },
      s("circle", { cx: x, cy: y, r: 18, fill: colour, opacity: 0.12 }),
      source.isPublic
        ? s("circle", { cx: x, cy: y, r: 7, fill: colour, stroke: colour, strokeWidth: 1.5 })
        : s("circle", { cx: x, cy: y, r: 5, fill: "none", stroke: colour, strokeWidth: 1.5 }),
      s(
        "text",
        {
          x,
          y: above ? y - 34 : y + 30,
          textAnchor: "middle",
          fontFamily: "Geist Mono, monospace",
          fontSize: 12.5,
          fill: "#eef0fb",
        },
        source.id,
      ),
      s(
        "text",
        {
          x,
          y: above ? y - 19 : y + 45,
          textAnchor: "middle",
          fontFamily: "Geist, sans-serif",
          fontSize: 11.5,
          fill: "#7a7e9c",
        },
        source.caption,
      ),
    );
  });
  return s(
    "svg",
    { viewBox: "0 0 520 300", width: "100%", "aria-hidden": "true", className: "orbit-svg" },
    s(
      "defs",
      null,
      s(
        "radialGradient",
        { id: "ov-halo", cx: "50%", cy: "50%", r: "50%" },
        s("stop", { offset: "0", stopColor: "#6D8BF8", stopOpacity: 0.45 }),
        s("stop", { offset: "1", stopColor: "#7C3AED", stopOpacity: 0 }),
      ),
      s(
        "linearGradient",
        { id: "ov-ring", x1: 0, x2: 1 },
        s("stop", { offset: "0", stopColor: "#5EEAD4", stopOpacity: 0.7 }),
        s("stop", { offset: ".5", stopColor: "#93A8FB", stopOpacity: 0.35 }),
        s("stop", { offset: "1", stopColor: "#C084FC", stopOpacity: 0.7 }),
      ),
    ),
    s("ellipse", { cx, cy, rx: 170, ry: 120, fill: "url(#ov-halo)" }),
    s("ellipse", {
      cx,
      cy,
      rx: 175,
      ry: 92,
      fill: "none",
      stroke: "url(#ov-ring)",
      strokeWidth: 1.2,
    }),
    s("ellipse", {
      cx,
      cy,
      rx: 130,
      ry: 58,
      fill: "none",
      stroke: "#93A8FB",
      strokeOpacity: 0.12,
      strokeDasharray: "2 5",
      className: "orb-dash7",
    }),
    s("g", { transform: "translate(200 90) scale(0.234375)" }, ...markParts("ov-mark", true)),
    ...nodes,
    props.sources.length > shown.length
      ? s(
          "text",
          { x: cx, y: 292, textAnchor: "middle", fontSize: 11.5, fill: "#7a7e9c" },
          `另有 ${String(props.sources.length - shown.length)} 个目录`,
        )
      : null,
  );
}

const RINGS: readonly (readonly [number, number, number, string])[] = [
  [-12, 268, 73, ""],
  [14, 243, 91, "rev"],
  [-36, 182, 79, ""],
];

/** Login planets in the local frame of their ring: ring, x, y, radius, colour (class lp1..lp4). */
const LOGIN_PLANETS: readonly (readonly [number, number, number, number, string])[] = [
  [0, -251.85, -24.96, 5, "#5EEAD4"],
  [0, 251.77, -25.02, 3.2, "#C4B5FD"],
  [1, -121.4, 78.83, 4.2, "#93A8FB"],
  [1, 121.4, -78.83, 6, "#C084FC"],
];

/**
 * A tilted ring's frame: sits at the orbit centre, sways (orb-tilt) and flattens (orb-breathe)
 * about it. Rings and the planets riding them share the same classes, so they stay together.
 */
function ringFrame(
  key: string,
  index: number,
  centre: readonly [number, number],
  ...children: ReactNode[]
): ReactElement {
  const tilt = RINGS[index]?.[0] ?? 0;
  return s(
    "g",
    {
      key,
      transform: `translate(${String(centre[0])} ${String(centre[1])}) rotate(${String(tilt)})`,
    },
    s(
      "g",
      { className: `orb-tilt lt${String(index)}` },
      s("g", { className: `orb-breathe lb${String(index)}` }, ...children),
    ),
  );
}
/** Login and password screens: halo, tilted rings with a travelling glint, the mark in the middle. */
export function LoginOrbit(): ReactElement {
  const cx = 310;
  const cy = 190;
  const rays = Array.from({ length: 28 }, (_, index) => {
    const angle = (index * Math.PI * 2) / 28 + 0.06;
    const inner = 92;
    const outer = 150 + ((index * 53) % 140);
    return s("line", {
      key: `ray-${String(index)}`,
      x1: (cx + inner * Math.cos(angle)).toFixed(1),
      y1: (cy + inner * Math.sin(angle)).toFixed(1),
      x2: (cx + outer * Math.cos(angle)).toFixed(1),
      y2: (cy + outer * Math.sin(angle)).toFixed(1),
      stroke: "url(#lo-ray)",
      strokeWidth: [0.6, 0.9, 1.2][index % 3],
    });
  });
  return s(
    "svg",
    { viewBox: "0 0 620 380", width: "100%", "aria-hidden": "true", className: "login-orbit" },
    s(
      "defs",
      null,
      s(
        "radialGradient",
        { id: "lo-halo", cx: "50%", cy: "50%", r: "50%" },
        s("stop", { offset: "0", stopColor: "#6D8BF8", stopOpacity: 0.55 }),
        s("stop", { offset: ".38", stopColor: "#7C3AED", stopOpacity: 0.2 }),
        s("stop", { offset: "1", stopColor: "#7C3AED", stopOpacity: 0 }),
      ),
      s(
        "radialGradient",
        { id: "lo-ray", gradientUnits: "userSpaceOnUse", cx, cy, r: 330 },
        s("stop", { offset: "0", stopColor: "#C4B5FD", stopOpacity: 0.55 }),
        s("stop", { offset: ".6", stopColor: "#93C5FD", stopOpacity: 0.08 }),
        s("stop", { offset: "1", stopColor: "#93C5FD", stopOpacity: 0 }),
      ),
      s(
        "filter",
        { id: "lo-blur", x: "-50%", y: "-50%", width: "200%", height: "200%" },
        s("feGaussianBlur", { stdDeviation: 28 }),
      ),
      ...RINGS.map((_, index) =>
        s(
          "linearGradient",
          {
            key: `rg-${String(index)}`,
            id: `lo-rg${String(index)}`,
            x1: 0,
            y1: 0,
            x2: 1,
            y2: 0.4 + index * 0.2,
          },
          s("stop", { offset: "0", stopColor: "#5EEAD4", stopOpacity: 0.05 + index * 0.05 }),
          s("stop", { offset: ".45", stopColor: "#93A8FB", stopOpacity: 0.75 }),
          s("stop", { offset: "1", stopColor: "#C084FC", stopOpacity: 0.08 }),
        ),
      ),
    ),
    s("ellipse", { className: "breathe", cx, cy, rx: 285, ry: 232.5, fill: "url(#lo-halo)" }),
    s("g", { opacity: 0.55 }, ...rays),
    s("circle", {
      cx,
      cy,
      r: 142.5,
      fill: "none",
      stroke: "#93A8FB",
      strokeOpacity: 0.1,
      strokeDasharray: "2 6",
      className: "orb-dash",
    }),
    s("circle", {
      className: "orb-fade",
      cx,
      cy,
      r: 202.5,
      fill: "none",
      stroke: "#C4B5FD",
      strokeOpacity: 0.06,
    }),
    ...RINGS.map(([, rx, ry, direction], index) =>
      ringFrame(
        `ring-${String(index)}`,
        index,
        [cx, cy],
        s(
          "g",
          { transform: `translate(${String(-cx)} ${String(-cy)})` },
          s("ellipse", {
            cx,
            cy,
            rx,
            ry,
            fill: "none",
            stroke: `url(#lo-rg${String(index)})`,
            strokeWidth: 1.4 - index * 0.25,
          }),
          s("ellipse", {
            className: direction === "" ? "glint" : `glint ${direction}`,
            pathLength: 1000,
            cx,
            cy,
            rx,
            ry,
            fill: "none",
            stroke: "#EEF0FB",
            strokeOpacity: 0.55,
            strokeWidth: 1.5,
            strokeLinecap: "round",
            strokeDasharray: "36 964",
            strokeDashoffset: index * 330,
          }),
        ),
      ),
    ),
    s("circle", { cx, cy, r: 75, fill: "#6D8BF8", opacity: 0.5, filter: "url(#lo-blur)" }),
    s("g", { transform: "translate(235 115) scale(0.29296875)" }, ...markParts("lo-mark", true)),
    ...LOGIN_PLANETS.map(([ring, x, y, r, colour], index) => {
      const name = `lp${String(index + 1)}`;
      return ringFrame(
        `sat-${name}`,
        ring,
        [cx, cy],
        s(
          "g",
          { className: `pl-x ${name}` },
          s(
            "g",
            { className: `pl-y ${name}` },
            s("circle", { cx: x, cy: y, r: r * 3.2, fill: colour, opacity: 0.14 }),
            s("circle", { className: "twinkle", cx: x, cy: y, r, fill: colour }),
          ),
        ),
      );
    }),
  );
}
