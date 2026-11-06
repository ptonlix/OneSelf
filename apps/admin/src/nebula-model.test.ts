import { describe, expect, it } from "vitest";

import {
  AUTO_TURN,
  filamentPoints,
  gestureDown,
  gestureMove,
  gestureSelects,
  ghostOffset,
  releaseSkyGesture,
  rotateY,
  distanceToSlider,
  shouldAutoTurn,
  sliderToDistance,
  wheelTurn,
  ZOOM_FAR,
  ZOOM_NEAR,
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
});
