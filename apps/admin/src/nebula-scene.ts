import * as THREE from "three";

import { cancelFrame, frame, now, observeSize, readPixelRatio } from "./dom";
import {
  anchorShift,
  directoryHitRadius,
  directoryLabelOffset,
  filamentPoints,
  glowScale,
  ghostOffset,
  inspectDistance,
  keptLabels,
  labelPriority,
  labelSize,
  layoutBounds,
  placeNebula,
  strandOpacity,
  viewFar,
  viewStart,
  zoomLookAt,
  ZOOM_NEAR,
  type LabelRect,
  type NebulaAttention,
  type Vec3,
} from "./nebula-model";
import type { AdminGraph } from "./types";

const COLORS = ["#5eead4", "#93a8fb", "#c084fc", "#7dd3fc"] as const;

export function mountNebula(
  canvas: object,
  labels: object,
  graph: AdminGraph,
  reduced: boolean,
  onDistance: (distance: number, far: number) => void,
): {
  dispose(): void;
  turn(dx: number, dy: number): void;
  pan(dx: number, dy: number): void;
  zoom(delta: number, x: number | null, y: number | null): void;
  zoomToSlider(slider: number): void;
  focus(attention: NebulaAttention): void;
  inspect(picked: { kind: "page"; key: string } | { kind: "source"; id: string }): void;
  home(): void;
  auto(dt: number, focused: boolean): void;
  pick(
    clientX: number,
    clientY: number,
  ): { kind: "page"; key: string } | { kind: "source"; id: string } | null;
} {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(readPixelRatio(), 2));
  renderer.setClearColor(0x05070f, 1);
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2200);
  const layout = placeNebula(graph);
  const bounds = layoutBounds([...layout.sources.values(), ...layout.pages.values()]);
  const far = viewFar(bounds);
  let distance = viewStart(bounds);
  const target = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  const offset = new THREE.Vector3();
  const homePoint = new THREE.Vector3();
  const placeCamera = (): void => {
    offset.set(0, 12, distance).applyQuaternion(spin);
    camera.position.copy(target).add(offset);
    // lookAt resolves roll from camera.up. World up flips the view at the pole and twists a rolled sky.
    camera.up.set(0, 1, 0).applyQuaternion(spin);
    camera.lookAt(target.x, target.y, target.z);
  };
  placeCamera();
  const soft = spriteTexture();
  addStarfield(world, soft);
  const pickables: THREE.Object3D[] = [];
  const marked = new Map<string, THREE.Object3D>();
  const gases: THREE.Object3D[] = [];
  for (const source of graph.sources) {
    const at = layout.sources.get(source.id);
    if (at === undefined) continue;
    const color =
      COLORS[graph.sources.findIndex((item) => item.id === source.id) % COLORS.length] ?? COLORS[0];
    const radius = directoryHitRadius(source.page_count);
    const gas = new THREE.Group();
    gas.position.set(at.x, at.y, at.z);
    world.add(gas);
    gases.push(gas);
    addGlow(gas, soft, color, glowScale(source.page_count), 0.2);
    addGlow(gas, soft, color, radius * 1.7, 0.28);
    const random = seeded(source.id);
    for (let i = 0; i < 11; i += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const distance = radius * (0.2 + random() * 0.65);
      const wisp = addGlow(
        gas,
        soft,
        color,
        radius * (0.35 + random() * 0.35),
        0.12 + random() * 0.1,
      );
      wisp.position.set(
        distance * Math.sin(phi) * Math.cos(theta),
        distance * Math.cos(phi) * 0.72,
        distance * Math.sin(phi) * Math.sin(theta),
      );
    }
    const cloudHit = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 12),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    cloudHit.userData["source"] = source.id;
    gas.add(cloudHit);
    pickables.push(cloudHit);
    const name = new THREE.Group();
    name.position.set(0, directoryLabelOffset(source.page_count), 0);
    gas.add(name);
    marked.set(`source:${source.id}`, name);
  }
  const anchors = new Map<string, THREE.Vector3>();
  for (const page of graph.pages) {
    const at = layout.pages.get(`${page.source}/${page.slug}`);
    if (at === undefined) continue;
    const key = `${page.source}/${page.slug}`;
    const anchor = new THREE.Group();
    anchor.position.set(at.x, at.y, at.z);
    world.add(anchor);
    anchors.set(key, anchor.position);
    marked.set(key, anchor);
    const color = page.visibility === "public" ? "#ffffff" : "#c4b5fd";
    addGlow(anchor, soft, color, page.visibility === "public" ? 16 : 12, 0.42);
    addGlow(anchor, soft, color, page.visibility === "public" ? 5.4 : 4.4, 0.95);
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(6, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.userData["key"] = key;
    anchor.add(hit);
    pickables.push(hit);
  }
  let ghostIndex = 0;
  for (const link of graph.links) {
    if (!link.broken) continue;
    const label = `${link.to.source}/${link.to.slug}`;
    if (anchors.has(label) || marked.has(`ghost:${label}`)) continue;
    const from = anchors.get(`${link.from.source}/${link.from.slug}`);
    const offset = ghostOffset(ghostIndex);
    ghostIndex += 1;
    const ghost = new THREE.Group();
    ghost.position.set(
      (from?.x ?? 0) + offset.x,
      (from?.y ?? 0) + offset.y,
      (from?.z ?? 0) + offset.z,
    );
    world.add(ghost);
    addGlow(ghost, soft, "#fb7d96", 8, 0.7);
    anchors.set(label, ghost.position);
    marked.set(`ghost:${label}`, ghost);
  }
  const strands: {
    material: THREE.PointsMaterial;
    from: string;
    to: string;
  }[] = [];
  for (const link of graph.links) {
    const from = anchors.get(`${link.from.source}/${link.from.slug}`);
    const to = anchors.get(`${link.to.source}/${link.to.slug}`);
    if (from === undefined || to === undefined) continue;
    const points = filamentPoints(
      { x: from.x, y: from.y, z: from.z },
      { x: to.x, y: to.y, z: to.z },
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        points.flatMap((point) => [point.x, point.y, point.z]),
        3,
      ),
    );
    const material = new THREE.PointsMaterial({
      map: soft,
      color: link.broken ? 0xfb7d96 : 0xb7c4ff,
      size: 5,
      transparent: true,
      opacity: strandOpacity({
        selected: null,
        from: `${link.from.source}/${link.from.slug}`,
        to: `${link.to.source}/${link.to.slug}`,
      }),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const dots = new THREE.Points(geometry, material);
    dots.frustumCulled = false;
    world.add(dots);
    strands.push({
      material,
      from: `${link.from.source}/${link.from.slug}`,
      to: `${link.to.source}/${link.to.slug}`,
    });
  }
  let attention: NebulaAttention = { hovered: null, selected: null, source: null };
  const quietSize = new Map<string, { width: number; height: number }>();
  const paintStrands = (): void => {
    for (const strand of strands) {
      strand.material.opacity = strandOpacity({
        selected: attention.selected,
        from: strand.from,
        to: strand.to,
      });
    }
  };
  const paint = (): void => {
    renderer.render(scene, camera);
    projectLabels(canvas, camera, labels, marked, attention, quietSize);
  };
  const resize = (): void => {
    const rect = box(canvas);
    if (rect.width < 2) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
    // setSize clears the drawing buffer. Reduced motion has no frame loop to fill it again.
    paint();
  };
  resize();
  const observer = observeSize(canvas, resize);
  let handle = 0;
  let flight: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromDistance: number;
    toDistance: number;
    started: number;
  } | null = null;
  const stepFly = (): void => {
    if (flight === null) return;
    const u = Math.min(1, (now() - flight.started) / 460);
    const eased = 1 - (1 - u) * (1 - u);
    target.lerpVectors(flight.from, flight.to, eased);
    distance = flight.fromDistance + (flight.toDistance - flight.fromDistance) * eased;
    placeCamera();
    onDistance(distance, far);
    if (u >= 1) flight = null;
  };
  const draw = (): void => {
    if (reduced) return;
    handle = frame(draw);
    for (const gas of gases) gas.rotation.y += 0.004;
    stepFly();
    paint();
  };
  if (box(canvas).width < 2) paint();
  onDistance(distance, far);
  if (!reduced) handle = frame(draw);
  const axis = {
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    forward: new THREE.Vector3(),
  };
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pivot = new THREE.Vector3();
  const landed = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const aim = (clientX: number, clientY: number): boolean => {
    const rect = box(canvas);
    if (rect.width < 2) return false;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return true;
  };
  const focusPoint = (into: THREE.Vector3): void => {
    raycaster.setFromCamera(pointer, camera);
    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction;
    camera.getWorldDirection(axis.forward);
    const denom = dir.dot(axis.forward);
    const depth =
      Math.abs(denom) < 1e-5
        ? distance
        : scratch.copy(target).sub(camera.position).dot(axis.forward) / denom;
    into.copy(origin).addScaledVector(dir, depth);
  };
  const orbit = (spinAxis: THREE.Vector3, worldAngle: number): void => {
    // Rotating the world by worldAngle matched this view. The camera offset takes the inverse.
    const turn = new THREE.Quaternion().setFromAxisAngle(spinAxis, -worldAngle);
    turn.multiply(spin);
    spin.copy(turn);
    placeCamera();
  };
  const cancelFly = (): void => {
    flight = null;
  };
  const flyTo = (point: Vec3, nextDistance: number): void => {
    const clamped = Math.min(far, Math.max(ZOOM_NEAR, nextDistance));
    if (reduced) {
      cancelFly();
      target.set(point.x, point.y, point.z);
      distance = clamped;
      placeCamera();
      onDistance(distance, far);
      paint();
      return;
    }
    flight = {
      from: target.clone(),
      to: new THREE.Vector3(point.x, point.y, point.z),
      fromDistance: distance,
      toDistance: clamped,
      started: now(),
    };
  };
  const applyDistance = (next: number, clientX: number | null, clientY: number | null): void => {
    cancelFly();
    const aimed = clientX !== null && clientY !== null && aim(clientX, clientY);
    if (aimed) focusPoint(pivot);
    distance = Math.min(far, Math.max(ZOOM_NEAR, next));
    let shift = { x: 0, y: 0, z: 0 };
    if (aimed) {
      placeCamera();
      focusPoint(landed);
      shift = anchorShift(
        { x: pivot.x, y: pivot.y, z: pivot.z },
        { x: landed.x, y: landed.y, z: landed.z },
      );
    }
    const nextTarget = zoomLookAt(
      { x: target.x, y: target.y, z: target.z },
      { x: homePoint.x, y: homePoint.y, z: homePoint.z },
      distance,
      far,
      aimed,
      shift,
    );
    target.set(nextTarget.x, nextTarget.y, nextTarget.z);
    placeCamera();
    onDistance(distance, far);
    paint();
  };
  return {
    pick(clientX, clientY) {
      if (!aim(clientX, clientY)) return null;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      for (const hit of hits) {
        const key = hit.object.userData["key"];
        if (typeof key === "string") return { kind: "page", key };
      }
      for (const hit of hits) {
        const source = hit.object.userData["source"];
        if (typeof source === "string") return { kind: "source", id: source };
      }
      return null;
    },
    dispose() {
      cancelFrame(handle);
      observer.disconnect();
      renderer.dispose();
    },
    turn(dx, dy) {
      cancelFly();
      axis.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      axis.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      orbit(axis.up, -dx * 0.005);
      orbit(axis.right, -dy * 0.005);
      paint();
    },
    pan(dx, dy) {
      cancelFly();
      const scale = Math.max(distance, 1) * 0.0016;
      axis.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      axis.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      target.addScaledVector(axis.right, -dx * scale);
      target.addScaledVector(axis.up, dy * scale);
      placeCamera();
      paint();
    },
    zoom(delta, x, y) {
      applyDistance(distance + delta, x, y);
    },
    zoomToSlider(slider) {
      const t = Math.min(1, Math.max(0, slider));
      applyDistance(far + t * (ZOOM_NEAR - far), null, null);
    },
    focus(next) {
      attention = next;
      paintStrands();
      paint();
    },
    inspect(picked) {
      if (picked.kind === "source") {
        const at = layout.sources.get(picked.id);
        const count = graph.sources.find((item) => item.id === picked.id)?.page_count ?? 1;
        if (at !== undefined) flyTo(at, inspectDistance("source", directoryHitRadius(count)));
        return;
      }
      const at = layout.pages.get(picked.key);
      if (at !== undefined) flyTo(at, inspectDistance("page", 36));
    },
    home() {
      flyTo(homePoint, viewStart(bounds));
    },
    auto(dt, focused) {
      if (flight !== null) return;
      // An open page rolls around the view axis. World +Z walks that page off the look-at point.
      if (focused) camera.getWorldDirection(axis.forward);
      else axis.up.set(0, 1, 0);
      orbit(focused ? axis.forward : axis.up, dt);
      paint();
    },
  };
}

function makeCanvas(): {
  width: number;
  height: number;
  getContext(kind: string): {
    createRadialGradient(
      x0: number,
      y0: number,
      r0: number,
      x1: number,
      y1: number,
      r1: number,
    ): {
      addColorStop(offset: number, color: string): void;
    };
    fillStyle: unknown;
    fillRect(x: number, y: number, w: number, h: number): void;
  } | null;
} {
  const document = (globalThis as { document?: { createElement?: unknown } }).document;
  const create = document?.createElement;
  if (typeof create !== "function") {
    return { width: 0, height: 0, getContext: () => null };
  }
  return (create as (tag: string) => ReturnType<typeof makeCanvas>).call(document, "canvas");
}

function spriteTexture(): THREE.CanvasTexture {
  const canvas = makeCanvas();
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context !== null) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.2)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function box(canvas: object): { width: number; height: number; left: number; top: number } {
  const read = (canvas as { getBoundingClientRect?: unknown }).getBoundingClientRect;
  if (typeof read !== "function") return { width: 0, height: 0, left: 0, top: 0 };
  return (read as () => { width: number; height: number; left: number; top: number }).call(canvas);
}

function addGlow(
  parent: THREE.Object3D,
  map: THREE.CanvasTexture,
  color: string,
  scale: number,
  opacity: number,
): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sprite.scale.setScalar(scale);
  parent.add(sprite);
  return sprite;
}

function addStarfield(world: THREE.Object3D, map: THREE.CanvasTexture): void {
  const random = seeded("starfield");
  world.add(starShell(random, 460, 280, 420, map, 0.9, 0.34));
  world.add(starShell(random, 640, 560, 860, map, 2.1, 0.5));
  for (let index = 0; index < 26; index += 1) {
    const at = shellPoint(random, 520, 840);
    const star = new THREE.Group();
    star.position.set(at.x, at.y, at.z);
    world.add(star);
    addGlow(
      star,
      map,
      random() > 0.72 ? "#c4b5fd" : "#eef3ff",
      2.4 + random() * 3.2,
      0.16 + random() * 0.22,
    );
  }
}

function starShell(
  random: () => number,
  count: number,
  near: number,
  far: number,
  map: THREE.CanvasTexture,
  size: number,
  opacity: number,
): THREE.Points {
  const positions: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = shellPoint(random, near, far);
    positions.push(at.x, at.y, at.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const dust = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map,
      color: 0xd7e4ff,
      size,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  dust.frustumCulled = false;
  return dust;
}

function shellPoint(random: () => number, near: number, far: number): Vec3 {
  const theta = random() * Math.PI * 2;
  const phi = Math.acos(2 * random() - 1);
  const radius = near + random() * (far - near);
  return {
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi) * 0.78,
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

function seeded(id: string): () => number {
  let seed = 2166136261;
  for (const char of id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function projectLabels(
  canvas: object,
  camera: THREE.PerspectiveCamera,
  labels: object,
  marked: ReadonlyMap<string, THREE.Object3D>,
  attention: NebulaAttention,
  quietSize: Map<string, { width: number; height: number }>,
): void {
  const query = (labels as { querySelectorAll?: unknown }).querySelectorAll;
  if (typeof query !== "function") return;
  const list = (query as (selector: string) => ArrayLike<unknown>).call(
    labels,
    "[data-source], [data-key], [data-ghost]",
  );
  const rect = box(canvas);
  const pending: (LabelRect & { element: LabelElement })[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const node = list[index];
    if (
      node === null ||
      typeof node !== "object" ||
      !("getAttribute" in node) ||
      !("style" in node)
    )
      continue;
    const element = node as LabelElement;
    const source = element.getAttribute("data-source");
    const key = element.getAttribute("data-key");
    const ghost = element.getAttribute("data-ghost");
    const id =
      source !== null
        ? `source:${source}`
        : key !== null
          ? key
          : ghost !== null
            ? `ghost:${ghost}`
            : "";
    const mark =
      source !== null
        ? marked.get(`source:${source}`)
        : key !== null
          ? marked.get(key)
          : ghost !== null
            ? marked.get(`ghost:${ghost}`)
            : undefined;
    if (id === "" || mark === undefined || rect.width < 2) {
      element.hidden = true;
      continue;
    }
    const projected = mark.getWorldPosition(new THREE.Vector3()).project(camera);
    const behind = projected.z > 1 || Math.abs(projected.x) > 1.05 || Math.abs(projected.y) > 1.05;
    if (behind) {
      element.hidden = true;
      continue;
    }
    const x = (projected.x * 0.5 + 0.5) * rect.width;
    const y = (-projected.y * 0.5 + 0.5) * rect.height;
    element.style.transform = `translate(${String(x)}px, ${String(y + 12)}px) translate(-50%, 0)`;
    const forced =
      source !== null || ghost !== null || id === attention.hovered || id === attention.selected;
    const lit = id === attention.hovered || id === attention.selected;
    const size = labelSize(element, id, lit, quietSize);
    const pageSource = key === null ? "" : (key.split("/")[0] ?? "");
    pending.push({
      element,
      id,
      left: x - size.width / 2,
      top: y + 12,
      width: size.width,
      height: size.height,
      priority: labelPriority({
        kind: source !== null ? "source" : ghost !== null ? "ghost" : "page",
        depth: projected.z,
        inSelectedSource: pageSource !== "" && pageSource === attention.source,
      }),
      forced,
    });
  }
  const kept = keptLabels(pending);
  for (const item of pending) item.element.hidden = !kept.has(item.id);
}

type LabelElement = {
  getAttribute(name: string): string | null;
  style: { transform: string };
  className?: string;
  classList?: { contains(name: string): boolean };
  hidden: boolean;
  offsetWidth: number;
  offsetHeight: number;
};
