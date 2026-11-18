const DRAG_THRESHOLD = 5;
const IDLE_RESUME_MS = 900;
/** Same rate as OrbitControls autoRotateSpeed 0.28 with no deltaTime, scaled to seconds. */
export const AUTO_TURN = ((Math.PI * 2) / 60 / 60) * 0.28 * 60;
export const ZOOM_NEAR = 42;
export const ZOOM_FAR = 560;
export const ZOOM_START = 268;

/** Slider 0 is farthest. Slider 1 is closest, so dragging right makes the sky larger. */
export function sliderToDistance(slider: number): number {
  const t = Math.min(1, Math.max(0, slider));
  return ZOOM_FAR + t * (ZOOM_NEAR - ZOOM_FAR);
}

export function distanceToSlider(distance: number): number {
  return Math.min(1, Math.max(0, (distance - ZOOM_FAR) / (ZOOM_NEAR - ZOOM_FAR)));
}

export type Vec3 = { readonly x: number; readonly y: number; readonly z: number };

export type DragMode = "turn" | "pan";

export type Gesture = {
  readonly x: number;
  readonly y: number;
  readonly moved: number;
  readonly mode: DragMode;
  readonly button: number;
};

export function filamentPoints(from: Vec3, to: Vec3, count = 22): Vec3[] {
  const mid = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    z: (from.z + to.z) / 2,
  };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  const side = { x: dz / length, y: 0, z: -dx / length };
  if (side.x === 0 && side.z === 0) side.x = 1;
  const bow = length * 0.16;
  mid.x += side.x * bow;
  mid.y += length * 0.04;
  mid.z += side.z * bow;
  const points: Vec3[] = [];
  for (let index = 0; index < count; index += 1) {
    const u = count === 1 ? 0 : index / (count - 1);
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const c = u * u;
    points.push({
      x: from.x * a + mid.x * b + to.x * c,
      y: from.y * a + mid.y * b + to.y * c,
      z: from.z * a + mid.z * b + to.z * c,
    });
  }
  return points;
}

export function rotateY(point: Vec3, yaw: number): Vec3 {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { x: point.x * cos + point.z * sin, y: point.y, z: -point.x * sin + point.z * cos };
}

export function skyDragMode(input: { button: number; shiftKey: boolean }): DragMode | null {
  if (input.button === 2 || (input.button === 0 && input.shiftKey)) return "pan";
  if (input.button === 0) return "turn";
  return null;
}

export function gestureDown(x: number, y: number, mode: DragMode = "turn", button = 0): Gesture {
  return { x, y, moved: 0, mode, button };
}

export function gestureMove(
  gesture: Gesture,
  x: number,
  y: number,
): {
  readonly gesture: Gesture;
  readonly dx: number;
  readonly dy: number;
  readonly dragging: boolean;
} {
  const dx = x - gesture.x;
  const dy = y - gesture.y;
  const moved = gesture.moved + Math.abs(dx) + Math.abs(dy);
  const next = { x, y, moved, mode: gesture.mode, button: gesture.button };
  return { gesture: next, dx, dy, dragging: !gestureSelects(next) };
}

export function gestureSelects(gesture: Gesture): boolean {
  return gesture.moved <= DRAG_THRESHOLD;
}

/** pointerup and pointercancel end the drag even when the pointer is no longer over the sky. */
export function releaseSkyGesture(input: {
  readonly type: "pointerup" | "pointercancel";
  readonly outside: boolean;
  readonly gesture: Gesture | null;
  readonly dragged: boolean;
}): { readonly gesture: null; readonly select: boolean } {
  return {
    gesture: null,
    select:
      input.type === "pointerup" &&
      !input.outside &&
      !input.dragged &&
      input.gesture !== null &&
      gestureSelects(input.gesture),
  };
}

/** Places each broken target away from its source star so the slug label stays readable. */
export function ghostOffset(index: number): Vec3 {
  const slot = index % 6;
  const ring = 1 + Math.floor(index / 6);
  const angle = (slot / 6) * Math.PI * 2;
  const radius = 46 * ring;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.85,
    z: (slot - 2.5) * 6,
  };
}

export function wheelTurn(input: {
  readonly ctrlKey: boolean;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaMode: number;
}):
  | { readonly kind: "zoom"; readonly delta: number }
  | { readonly kind: "turn"; readonly dx: number; readonly dy: number } {
  if (input.ctrlKey) return { kind: "zoom", delta: input.deltaY * 0.55 };
  const unit = input.deltaMode === 1 ? 16 : input.deltaMode === 2 ? 80 : 1;
  return { kind: "turn", dx: input.deltaX * unit * 0.65, dy: input.deltaY * unit * 0.65 };
}

export function shouldAutoTurn(input: {
  readonly reduced: boolean;
  readonly dragging: boolean;
  readonly idleMs: number;
  readonly flying: boolean;
}): boolean {
  return !input.reduced && !input.dragging && !input.flying && input.idleMs > IDLE_RESUME_MS;
}

const VIEW_FOV = 42;
const SOURCE_RING_MIN = 120;
export const CLOUD_GAP = 36;
const LABEL_GAP = 8;
const FAR_CAP = 1600;
export const STRAND_IDLE = 0.24;
export const STRAND_DIM = 0.07;
export const STRAND_HOT = 0.9;

export type NebulaAttention = {
  readonly hovered: string | null;
  readonly selected: string | null;
  readonly source: string | null;
};

export type LabelRect = {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly priority: number;
  readonly forced: boolean;
};

/** Keeps neighboring stars pickable. Linear growth outruns the camera without separating labels. */
export function pageRadius(count: number): number {
  if (count <= 1) return 0;
  return Math.max(22, 9 * Math.sqrt(count));
}

/** Sits just above the stars. A linear page-count offset swings the name off its cloud when the sky turns. */
export function directoryLabelOffset(pageCount: number): number {
  return pageRadius(pageCount) * 0.55 + 18;
}

/** Covers this directory's stars, not the empty space of a neighboring cloud. */
export function directoryHitRadius(pageCount: number): number {
  return Math.max(16, pageRadius(pageCount) + 6);
}

/** Soft glow diameter, tied to the stars rather than `24 + pageCount * 5`. */
export function glowScale(pageCount: number): number {
  return Math.max(48, directoryHitRadius(pageCount) * 2.5);
}

export function cloudExtent(pageCount: number): number {
  return glowScale(pageCount) / 2;
}

function pageCap(index: number, count: number, radius: number): Vec3 {
  if (count <= 1 || radius === 0) return { x: 0, y: 0, z: 0 };
  const phi = ((index + 0.5) / count) * 1.05;
  const theta = Math.PI * (3 - Math.sqrt(5)) * index;
  const ring = Math.sin(phi);
  return {
    x: Math.cos(theta) * ring * radius,
    y: Math.sin(theta) * ring * radius * 0.86,
    z: Math.cos(phi) * radius * 0.42,
  };
}

function sourceAt(index: number, count: number, ring: number): Vec3 {
  const angle = (index / Math.max(count, 1)) * Math.PI * 2;
  return {
    x: Math.cos(angle) * ring,
    y: Math.sin(angle) * ring * 0.62,
    z: Math.sin(angle * 2) * 16,
  };
}

/** Y is squashed, so the flat chord is not the on-screen distance. Scale until neighbors clear. */
export function sourceRing(radii: readonly number[]): number {
  const count = radii.length;
  if (count <= 1) return 0;
  let ring = SOURCE_RING_MIN;
  for (let step = 0; step < 8; step += 1) {
    let tight = false;
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      const gap = apart(sourceAt(index, count, ring), sourceAt(next, count, ring));
      const need = (radii[index] ?? 0) + (radii[next] ?? 0) + CLOUD_GAP;
      if (gap + 0.5 < need) {
        ring *= need / Math.max(gap, 1);
        tight = true;
      }
    }
    if (!tight) break;
  }
  return ring;
}

export function placeNebula(input: {
  readonly sources: readonly { readonly id: string; readonly page_count: number }[];
  readonly pages: readonly { readonly source: string; readonly slug: string }[];
}): { readonly sources: ReadonlyMap<string, Vec3>; readonly pages: ReadonlyMap<string, Vec3> } {
  const grouped = input.sources.map((source) =>
    input.pages.filter((page) => page.source === source.id),
  );
  const ring = sourceRing(grouped.map((pages) => cloudExtent(pages.length)));
  const sources = new Map<string, Vec3>();
  const pages = new Map<string, Vec3>();
  input.sources.forEach((source, index) => {
    const origin =
      input.sources.length === 1
        ? { x: 0, y: 0, z: 0 }
        : sourceAt(index, input.sources.length, ring);
    sources.set(source.id, origin);
    const own = grouped[index] ?? [];
    const radius = pageRadius(own.length);
    own.forEach((page, pageIndex) => {
      const local = pageCap(pageIndex, own.length, radius);
      pages.set(`${page.source}/${page.slug}`, {
        x: origin.x + local.x,
        y: origin.y + local.y,
        z: origin.z + local.z,
      });
    });
  });
  return { sources, pages };
}

export function layoutBounds(points: readonly Vec3[]): { width: number; height: number } {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { width: maxX - minX, height: maxY - minY };
}

export function frameDistance(
  bounds: { readonly width: number; readonly height: number },
  aspect = 1.35,
): number {
  const half = Math.tan((VIEW_FOV * Math.PI) / 360);
  const byHeight = ((Math.max(bounds.height, 1) / 2) * 1.2) / half;
  const byWidth = ((Math.max(bounds.width, 1) / 2) * 1.2) / (half * Math.max(aspect, 0.8));
  return Math.max(byHeight, byWidth);
}

export function viewFar(bounds: { readonly width: number; readonly height: number }): number {
  return Math.min(FAR_CAP, Math.max(ZOOM_FAR, frameDistance(bounds)));
}

export function viewStart(bounds: { readonly width: number; readonly height: number }): number {
  const framed = frameDistance(bounds);
  const far = viewFar(bounds);
  return Math.min(far, framed > ZOOM_START ? framed : ZOOM_START);
}

/**
 * 1 snaps the look-at point home.
 * Only an un-aimed slider parked at `far` may do that. Aimed zoom never does,
 * including inside the old outer 22% band, or a zoom-in in that band yanks the view home.
 */
export function homePull(distance: number, far: number, aimed = false): number {
  if (aimed || distance < far) return 0;
  return 1;
}

/** Aimed zoom keeps the pointer shift and never lerps home. An un-aimed far end snaps home and ignores shift. */
export function zoomLookAt(
  target: Vec3,
  home: Vec3,
  distance: number,
  far: number,
  aimed: boolean,
  shift: Vec3,
): Vec3 {
  const pull = homePull(distance, far, aimed);
  const pulled = {
    x: target.x + (home.x - target.x) * pull,
    y: target.y + (home.y - target.y) * pull,
    z: target.z + (home.z - target.z) * pull,
  };
  if (!aimed) return pulled;
  return {
    x: pulled.x + shift.x,
    y: pulled.y + shift.y,
    z: pulled.z + shift.z,
  };
}

export function anchorShift(pivot: Vec3, landed: Vec3): Vec3 {
  return { x: pivot.x - landed.x, y: pivot.y - landed.y, z: pivot.z - landed.z };
}

export function inspectDistance(kind: "source" | "page", radius: number): number {
  const half = Math.tan((VIEW_FOV * Math.PI) / 360);
  const span = kind === "page" ? Math.max(radius, 36) : Math.max(radius, 18);
  // flyTo clamps to the sky's dynamic far. A fixed 560 cap leaves a large directory unframeable.
  return Math.max(ZOOM_NEAR, (span * 1.55) / half);
}

export type SizedLabel = {
  className?: string;
  classList?: { contains(name: string): boolean };
  hidden: boolean;
  offsetWidth: number;
  offsetHeight: number;
};

function labelClassLit(element: SizedLabel): boolean {
  if (element.classList?.contains("lit") === true) return true;
  const name = element.className;
  return typeof name === "string" && name.split(/\s+/).includes("lit");
}

/** Hidden buttons report no size, so the quiet width is cached before culling. A lit capsule must not enter that cache. */
export function labelSize(
  element: SizedLabel,
  id: string,
  attentionLit: boolean,
  quietSize: Map<string, { width: number; height: number }>,
): { width: number; height: number } {
  const cached = quietSize.get(id);
  const classLit = labelClassLit(element);
  // Attention can clear before React removes `lit`. Only the element's class says the measure is quiet.
  if (cached === undefined || attentionLit || classLit) {
    element.hidden = false;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    if (width > 0 && height > 0 && !classLit) quietSize.set(id, { width, height });
    if (width > 0 && height > 0) return { width, height };
  }
  return cached ?? { width: 148, height: 22 };
}

export function labelPriority(input: {
  readonly kind: "source" | "page" | "ghost";
  readonly depth: number;
  readonly inSelectedSource: boolean;
}): number {
  if (input.kind === "source") return 300;
  if (input.kind === "ghost") return 200;
  return (input.inSelectedSource ? 40 : 0) - input.depth;
}

export function keptLabels(labels: readonly LabelRect[], gap = LABEL_GAP): ReadonlySet<string> {
  const ordered = [...labels].sort((left, right) => {
    if (left.forced !== right.forced) return left.forced ? -1 : 1;
    if (left.priority !== right.priority) return right.priority - left.priority;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  const placed: LabelRect[] = [];
  const kept = new Set<string>();
  for (const label of ordered) {
    if (!label.forced && placed.some((other) => intersects(other, label, gap))) continue;
    placed.push(label);
    kept.add(label.id);
  }
  return kept;
}

export function strandOpacity(input: {
  readonly selected: string | null;
  readonly from: string;
  readonly to: string;
}): number {
  if (input.selected !== null && (input.from === input.selected || input.to === input.selected)) {
    return STRAND_HOT;
  }
  return input.selected === null ? STRAND_IDLE : STRAND_DIM;
}

function apart(left: Vec3, right: Vec3): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function intersects(left: LabelRect, right: LabelRect, gap: number): boolean {
  return (
    left.left < right.left + right.width + gap &&
    right.left < left.left + left.width + gap &&
    left.top < right.top + right.height + gap &&
    right.top < left.top + left.height + gap
  );
}
