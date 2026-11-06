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

export type Gesture = { readonly x: number; readonly y: number; readonly moved: number };

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

export function gestureDown(x: number, y: number): Gesture {
  return { x, y, moved: 0 };
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
  const next = { x, y, moved };
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
