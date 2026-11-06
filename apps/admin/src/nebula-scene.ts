import * as THREE from "three";

import { cancelFrame, frame, observeSize, readPixelRatio } from "./dom";
import {
  filamentPoints,
  ghostOffset,
  ZOOM_FAR,
  ZOOM_NEAR,
  ZOOM_START,
  type Vec3,
} from "./nebula-model";
import type { AdminGraph } from "./types";

const COLORS = ["#5eead4", "#93a8fb", "#c084fc", "#7dd3fc"] as const;

export function mountNebula(
  canvas: object,
  labels: object,
  graph: AdminGraph,
  reduced: boolean,
  onDistance: (distance: number) => void,
): {
  dispose(): void;
  turn(dx: number, dy: number): void;
  zoom(delta: number): void;
  zoomTo(distance: number): void;
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
  let distance = ZOOM_START;
  camera.position.set(0, 12, distance);
  camera.lookAt(0, 0, 0);
  const soft = spriteTexture();
  addStarfield(world, soft);
  const layout = place(graph);
  const pickables: THREE.Object3D[] = [];
  const marked = new Map<string, THREE.Object3D>();
  const gases: THREE.Object3D[] = [];
  for (const source of graph.sources) {
    const at = layout.sources.get(source.id);
    if (at === undefined) continue;
    const color =
      COLORS[graph.sources.findIndex((item) => item.id === source.id) % COLORS.length] ?? COLORS[0];
    const radius = cloudRadius(source.page_count);
    const gas = new THREE.Group();
    gas.position.set(at.x, at.y, at.z);
    world.add(gas);
    gases.push(gas);
    addGlow(gas, soft, color, radius * 2.35, 0.22);
    addGlow(gas, soft, color, radius * 1.35, 0.32);
    const random = seeded(source.id);
    for (let i = 0; i < 11; i += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const distance = radius * (0.25 + random() * 0.7);
      const wisp = addGlow(
        gas,
        soft,
        color,
        radius * (0.55 + random() * 0.45),
        0.12 + random() * 0.1,
      );
      wisp.position.set(
        distance * Math.sin(phi) * Math.cos(theta),
        distance * Math.cos(phi) * 0.72,
        distance * Math.sin(phi) * Math.sin(theta),
      );
    }
    const cloudHit = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.96, 16, 12),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    cloudHit.userData["source"] = source.id;
    gas.add(cloudHit);
    pickables.push(cloudHit);
    const name = new THREE.Group();
    name.position.set(0, radius * 1.05, 0);
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
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const dots = new THREE.Points(geometry, material);
    dots.frustumCulled = false;
    world.add(dots);
  }
  const paint = (): void => {
    renderer.render(scene, camera);
    projectLabels(canvas, camera, labels, marked);
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
  const draw = (): void => {
    if (reduced) return;
    handle = frame(draw);
    for (const gas of gases) gas.rotation.y += 0.004;
    paint();
  };
  if (box(canvas).width < 2) paint();
  onDistance(distance);
  if (!reduced) handle = frame(draw);
  const axis = { up: new THREE.Vector3(), right: new THREE.Vector3() };
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const applyDistance = (next: number): void => {
    distance = Math.min(ZOOM_FAR, Math.max(ZOOM_NEAR, next));
    camera.position.set(0, 12, distance);
    camera.lookAt(0, 0, 0);
    onDistance(distance);
    paint();
  };
  return {
    pick(clientX, clientY) {
      const rect = box(canvas);
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickables, false)[0];
      const key = hit?.object.userData["key"];
      if (typeof key === "string") return { kind: "page", key };
      const source = hit?.object.userData["source"];
      return typeof source === "string" ? { kind: "source", id: source } : null;
    },
    dispose() {
      cancelFrame(handle);
      observer.disconnect();
      renderer.dispose();
    },
    turn(dx, dy) {
      axis.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      axis.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      world.rotateOnWorldAxis(axis.up, -dx * 0.005);
      world.rotateOnWorldAxis(axis.right, -dy * 0.005);
      paint();
    },
    zoom(delta) {
      applyDistance(distance + delta);
    },
    zoomTo(next) {
      applyDistance(next);
    },
    auto(dt, focused) {
      world.rotateOnWorldAxis(focused ? axis.right.set(0, 0, 1) : axis.up.set(0, 1, 0), 0);
      world.rotateOnWorldAxis(
        focused ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0),
        dt,
      );
      paint();
    },
  };
}

function place(graph: AdminGraph): { sources: Map<string, Vec3>; pages: Map<string, Vec3> } {
  const sources = new Map<string, Vec3>();
  graph.sources.forEach((source, index) => {
    const angle = (index / Math.max(graph.sources.length, 1)) * Math.PI * 2;
    const spread = 120;
    sources.set(source.id, {
      x: Math.cos(angle) * spread,
      y: Math.sin(angle) * spread * 0.62,
      z: Math.sin(angle * 2) * 16,
    });
  });
  const pages = new Map<string, Vec3>();
  for (const source of graph.sources) {
    const origin = sources.get(source.id) ?? { x: 0, y: 0, z: 0 };
    const own = graph.pages.filter((page) => page.source === source.id);
    const radius = Math.max(34, 24 + own.length * 5);
    own.forEach((page, index) => {
      const local = fibonacci(index, own.length, radius * 0.48);
      pages.set(`${page.source}/${page.slug}`, {
        x: origin.x + local.x,
        y: origin.y + local.y,
        z: origin.z + local.z,
      });
    });
  }
  return { sources, pages };
}

function fibonacci(index: number, count: number, radius: number): Vec3 {
  if (count <= 1) return { x: 0, y: 0, z: 0 };
  const y = 1 - (index / (count - 1)) * 2;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (3 - Math.sqrt(5)) * index;
  return { x: Math.cos(theta) * ring * radius, y: y * radius, z: Math.sin(theta) * ring * radius };
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

function cloudRadius(pageCount: number): number {
  return Math.max(34, 24 + pageCount * 5);
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
): void {
  const query = (labels as { querySelectorAll?: unknown }).querySelectorAll;
  if (typeof query !== "function") return;
  const list = (query as (selector: string) => ArrayLike<unknown>).call(
    labels,
    "[data-source], [data-key], [data-ghost]",
  );
  const rect = box(canvas);
  for (let index = 0; index < list.length; index += 1) {
    const node = list[index];
    if (
      node === null ||
      typeof node !== "object" ||
      !("getAttribute" in node) ||
      !("style" in node)
    )
      continue;
    const element = node as {
      getAttribute(name: string): string | null;
      style: { transform: string };
      hidden: boolean;
    };
    const source = element.getAttribute("data-source");
    const key = element.getAttribute("data-key");
    const ghost = element.getAttribute("data-ghost");
    const mark =
      source !== null
        ? marked.get(`source:${source}`)
        : key !== null
          ? marked.get(key)
          : ghost !== null
            ? marked.get(`ghost:${ghost}`)
            : undefined;
    if (mark === undefined || rect.width < 2) {
      element.hidden = true;
      continue;
    }
    const projected = mark.getWorldPosition(new THREE.Vector3()).project(camera);
    const behind = projected.z > 1 || Math.abs(projected.x) > 1.05 || Math.abs(projected.y) > 1.05;
    element.hidden = behind;
    if (behind) continue;
    const x = (projected.x * 0.5 + 0.5) * rect.width;
    const y = (-projected.y * 0.5 + 0.5) * rect.height;
    element.style.transform = `translate(${String(x)}px, ${String(y + 12)}px) translate(-50%, 0)`;
  }
}
