import { describe, expect, it } from "vitest";

import {
  AUTO_TURN,
  CLOUD_GAP,
  filamentPoints,
  frameDistance,
  gestureDown,
  gestureMove,
  gestureSelects,
  ghostOffset,
  homePull,
  inspectDistance,
  labelSize,
  keptLabels,
  labelPriority,
  layoutBounds,
  cloudExtent,
  directoryHitRadius,
  directoryLabelOffset,
  glowScale,
  pageRadius,
  placeNebula,
  releaseSkyGesture,
  rotateY,
  distanceToSlider,
  shouldAutoTurn,
  skyDragMode,
  sliderToDistance,
  sourceRing,
  strandOpacity,
  STRAND_DIM,
  STRAND_HOT,
  STRAND_IDLE,
  viewStart,
  wheelTurn,
  zoomLookAt,
  ZOOM_FAR,
  ZOOM_NEAR,
  ZOOM_START,
  type LabelRect,
  type Vec3,
} from "./nebula-model";

function apart(left: Vec3, right: Vec3): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

describe("nebula geometry", () => {
  it("keeps filament ends on the stars after the parent turns", () => {
    const from = { x: -20, y: 4, z: 2 };
    const to = { x: 16, y: -6, z: 8 };
    const yaw = 1.2;
    const points = filamentPoints(from, to);
    expect(points[0]).toEqual(from);
    expect(points[points.length - 1]).toEqual(to);
    const turned = points.map((point) => rotateY(point, yaw));
    expect(turned[0]).toEqual(rotateY(from, yaw));
    expect(turned[turned.length - 1]).toEqual(rotateY(to, yaw));
    expect(JSON.stringify(points)).not.toContain("Line");
  });

  it("treats a drag past the threshold as turning, not a selection", () => {
    const moved = gestureMove(gestureDown(0, 0), 12, 1);
    expect(moved.dragging).toBe(true);
    expect(gestureSelects(moved.gesture)).toBe(false);
    const short = gestureMove(gestureDown(0, 0), 4, 0);
    expect(short.dragging).toBe(false);
    expect(gestureSelects(short.gesture)).toBe(true);
    expect(gestureSelects(gestureMove(gestureDown(0, 0), 2, 1).gesture)).toBe(true);
  });

  it("clears the gesture when the pointer is released outside the sky", () => {
    const dragging = gestureMove(gestureDown(8, 8), 30, 2);
    const released = releaseSkyGesture({
      type: "pointerup",
      outside: true,
      gesture: dragging.gesture,
      dragged: dragging.dragging,
    });
    expect(released.gesture).toBeNull();
    expect(released.select).toBe(false);
    const cancelled = releaseSkyGesture({
      type: "pointercancel",
      outside: true,
      gesture: dragging.gesture,
      dragged: true,
    });
    expect(cancelled.gesture).toBeNull();
    expect(cancelled.select).toBe(false);
    expect(
      releaseSkyGesture({
        type: "pointerup",
        outside: false,
        gesture: gestureDown(1, 1),
        dragged: false,
      }).select,
    ).toBe(true);
  });

  it("spreads broken-link ghosts so their labels do not stack", () => {
    for (let left = 0; left < 8; left += 1) {
      for (let right = left + 1; right < 8; right += 1) {
        expect(apart(ghostOffset(left), ghostOffset(right))).toBeGreaterThan(32);
      }
    }
  });

  it("maps the slider so the right end is closer", () => {
    expect(sliderToDistance(0)).toBe(ZOOM_FAR);
    expect(sliderToDistance(1)).toBe(ZOOM_NEAR);
    expect(sliderToDistance(1)).toBeLessThan(sliderToDistance(0));
    expect(distanceToSlider(ZOOM_NEAR)).toBe(1);
  });

  it("turns on a trackpad scroll and zooms only with the control key", () => {
    expect(wheelTurn({ ctrlKey: false, deltaX: 4, deltaY: 10, deltaMode: 0 }).kind).toBe("turn");
    const zoom = wheelTurn({ ctrlKey: true, deltaX: 0, deltaY: 8, deltaMode: 0 });
    expect(zoom).toEqual({ kind: "zoom", delta: 4.4 });
  });

  it("matches the previous gentle auto-turn and yields while the owner is turning", () => {
    expect(AUTO_TURN).toBeCloseTo(((Math.PI * 2) / 60 / 60) * 0.28 * 60);
    expect(shouldAutoTurn({ reduced: false, dragging: false, idleMs: 901, flying: false })).toBe(
      true,
    );
    expect(shouldAutoTurn({ reduced: false, dragging: true, idleMs: 2000, flying: false })).toBe(
      false,
    );
    expect(shouldAutoTurn({ reduced: false, dragging: false, idleMs: 900, flying: false })).toBe(
      false,
    );
    expect(shouldAutoTurn({ reduced: true, dragging: false, idleMs: 5000, flying: false })).toBe(
      false,
    );
  });

  it("centers one directory and keeps neighboring page clouds apart", () => {
    const alone = placeNebula({
      sources: [{ id: "notes", page_count: 1 }],
      pages: [{ source: "notes", slug: "now" }],
    });
    expect(alone.sources.get("notes")).toEqual({ x: 0, y: 0, z: 0 });

    const pages = Array.from({ length: 48 }, (_, index) => ({
      source: index < 24 ? "notes" : "work",
      slug: `p${String(index)}`,
    }));
    const placed = placeNebula({
      sources: [
        { id: "notes", page_count: 24 },
        { id: "work", page_count: 24 },
      ],
      pages,
    });
    const notes = placed.sources.get("notes");
    const work = placed.sources.get("work");
    expect(notes).toBeDefined();
    expect(work).toBeDefined();
    if (notes === undefined || work === undefined) return;
    expect(apart(notes, work)).toBeGreaterThanOrEqual(cloudExtent(24) * 2 + CLOUD_GAP - 0.5);
    for (const [key, point] of placed.pages) {
      const origin = key.startsWith("notes/") ? notes : work;
      expect(apart(point, origin)).toBeLessThanOrEqual(pageRadius(24) + 0.01);
      expect(point.z).toBeGreaterThanOrEqual(origin.z);
    }
    expect(sourceRing([8, 8, 8, 8])).toBeGreaterThanOrEqual(120);
    const crowded = 32;
    const linear = (24 + crowded * 5) * 1.05;
    expect(directoryLabelOffset(crowded)).toBeLessThan(linear / 2);
    expect(directoryLabelOffset(crowded)).toBeGreaterThan(pageRadius(crowded) * 0.4);
    expect(glowScale(crowded)).toBeLessThan(linear);
    expect(directoryHitRadius(crowded)).toBeLessThan(cloudExtent(crowded));
  });

  it("stays at the original distance until the map no longer fits", () => {
    const small = layoutBounds([{ x: 40, y: 20, z: 0 }]);
    expect(frameDistance(small)).toBeLessThan(ZOOM_START);
    expect(viewStart(small)).toBe(ZOOM_START);
    const wide = layoutBounds([
      { x: -420, y: 0, z: 0 },
      { x: 420, y: 180, z: 0 },
    ]);
    expect(viewStart(wide)).toBeGreaterThan(ZOOM_START);
    expect(viewStart(wide)).toBeGreaterThan(ZOOM_FAR);
  });

  it("keeps forced labels and drops a title that would cover another", () => {
    const box = (id: string, left: number, priority: number, forced: boolean): LabelRect => ({
      id,
      left,
      top: 0,
      width: 80,
      height: 20,
      priority,
      forced,
    });
    const kept = keptLabels([
      box(
        "notes/late",
        0,
        labelPriority({ kind: "page", depth: 0.4, inSelectedSource: false }),
        false,
      ),
      box(
        "notes/near",
        10,
        labelPriority({ kind: "page", depth: -0.2, inSelectedSource: true }),
        false,
      ),
      box(
        "source:notes",
        4,
        labelPriority({ kind: "source", depth: 0, inSelectedSource: false }),
        true,
      ),
      box("ghost:work/old", 200, 0, true),
    ]);
    expect(kept.has("source:notes")).toBe(true);
    expect(kept.has("ghost:work/old")).toBe(true);
    expect(kept.has("notes/near")).toBe(false);
    expect(kept.has("notes/late")).toBe(false);
    const open = keptLabels([box("a", 0, 1, false), box("b", 100, 1, false)]);
    expect(open.has("a")).toBe(true);
    expect(open.has("b")).toBe(true);
    const preferred = keptLabels([
      box(
        "other/late",
        0,
        labelPriority({ kind: "page", depth: -0.8, inSelectedSource: false }),
        false,
      ),
      box(
        "notes/mine",
        6,
        labelPriority({ kind: "page", depth: 0.6, inSelectedSource: true }),
        false,
      ),
    ]);
    expect(preferred.has("notes/mine")).toBe(true);
    expect(preferred.has("other/late")).toBe(false);
    const hovered = keptLabels([box("covered", 0, 1, false), box("hovered", 8, 0, true)]);
    expect(hovered.has("hovered")).toBe(true);
    expect(hovered.has("covered")).toBe(false);
  });

  it("pans with shift or the right button and zooms toward a cluster without sticking to the origin", () => {
    expect(skyDragMode({ button: 0, shiftKey: false })).toBe("turn");
    expect(skyDragMode({ button: 0, shiftKey: true })).toBe("pan");
    expect(skyDragMode({ button: 2, shiftKey: false })).toBe("pan");
    expect(skyDragMode({ button: 1, shiftKey: false })).toBeNull();
    expect(homePull(ZOOM_NEAR, ZOOM_FAR)).toBe(0);
    expect(homePull(ZOOM_FAR, ZOOM_FAR)).toBe(1);
    const page = inspectDistance("page", 12);
    const source = inspectDistance("source", 80);
    expect(page).toBeGreaterThan(ZOOM_NEAR);
    expect(source).toBeGreaterThan(page);
    expect(source).toBeLessThan(ZOOM_FAR);
    expect(inspectDistance("source", directoryHitRadius(220))).toBeGreaterThan(ZOOM_FAR);
  });

  it("does not cache a lit measurement as the quiet label size", () => {
    const cache = new Map<string, { width: number; height: number }>([
      ["notes/now", { width: 48, height: 18 }],
    ]);
    const lit = {
      className: "pname lit",
      classList: { contains: (name: string) => name === "lit" },
      hidden: false,
      offsetWidth: 196,
      offsetHeight: 28,
    };
    // Hover already cleared. React has not removed the lit class, so the capsule is still wide.
    const size = labelSize(lit, "notes/now", false, cache);
    expect(size).toEqual({ width: 196, height: 28 });
    expect(cache.get("notes/now")).toEqual({ width: 48, height: 18 });
    const quiet = { className: "pname", hidden: true, offsetWidth: 52, offsetHeight: 18 };
    const fresh = new Map<string, { width: number; height: number }>();
    labelSize(quiet, "notes/later", false, fresh);
    expect(fresh.get("notes/later")).toEqual({ width: 52, height: 18 });
  });

  it("does not move an aimed zoom inside the old home band toward the origin", () => {
    const far = 900;
    const span = far - ZOOM_NEAR;
    const distance = far - span * 0.1;
    expect(far - distance).toBeLessThan(span * 0.22);
    const target = { x: 160, y: -24, z: 48 };
    const home = { x: 0, y: 0, z: 0 };
    const shift = { x: 3, y: -2, z: 1 };
    expect(zoomLookAt(target, home, distance, far, true, shift)).toEqual({
      x: 163,
      y: -26,
      z: 49,
    });
    expect(zoomLookAt(target, home, distance, far, false, shift)).toEqual(target);
    expect(homePull(distance, far, true)).toBe(0);
    expect(zoomLookAt(target, home, far, far, false, shift)).toEqual(home);
    expect(zoomLookAt(target, home, far, far, true, shift)).toEqual({
      x: target.x + shift.x,
      y: target.y + shift.y,
      z: target.z + shift.z,
    });
  });

  it("brightens only the filaments that touch the selected page", () => {
    expect(strandOpacity({ selected: null, from: "a/1", to: "b/2" })).toBe(STRAND_IDLE);
    expect(strandOpacity({ selected: "a/1", from: "a/1", to: "b/2" })).toBe(STRAND_HOT);
    expect(strandOpacity({ selected: "a/1", from: "c/3", to: "b/2" })).toBe(STRAND_DIM);
    expect(STRAND_HOT).toBeGreaterThan(STRAND_IDLE);
    expect(STRAND_IDLE).toBeGreaterThan(STRAND_DIM);
  });
});
