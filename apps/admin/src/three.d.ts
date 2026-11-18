/* Ambient stub. Classes exist only so `new THREE.X()` typechecks without DOM lib. */
/* eslint-disable @typescript-eslint/no-extraneous-class */
declare module "three" {
  export class Vector2 {
    x: number;
    y: number;
  }
  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    copy(other: Vector3): this;
    clone(): Vector3;
    project(camera: Object3D): this;
    applyQuaternion(quaternion: Quaternion): this;
    add(other: Vector3): this;
    sub(other: Vector3): this;
    addScaledVector(other: Vector3, scale: number): this;
    lerp(other: Vector3, alpha: number): this;
    lerpVectors(from: Vector3, to: Vector3, alpha: number): this;
    dot(other: Vector3): number;
  }
  export class Quaternion {
    constructor();
    setFromAxisAngle(axis: Vector3, angle: number): this;
    multiply(other: Quaternion): this;
    copy(other: Quaternion): this;
  }
  export class Object3D {
    add(child: Object3D): this;
    position: Vector3;
    userData: Record<string, unknown>;
    scale: { setScalar(value: number): void };
    quaternion: Quaternion;
    up: Vector3;
    rotation: { y: number };
    rotateOnWorldAxis(axis: Vector3, angle: number): this;
    getWorldPosition(target: Vector3): Vector3;
    localToWorld(target: Vector3): Vector3;
  }
  export class Scene extends Object3D {}
  export class Group extends Object3D {}
  export class PerspectiveCamera extends Object3D {
    constructor(fov: number, aspect: number, near: number, far: number);
    aspect: number;
    updateProjectionMatrix(): void;
    lookAt(x: number, y: number, z: number): void;
    getWorldDirection(target: Vector3): Vector3;
  }
  export class WebGLRenderer {
    constructor(params?: object);
    setPixelRatio(value: number): void;
    setClearColor(color: number, alpha: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Object3D, camera: Object3D): void;
    dispose(): void;
  }
  export class BufferGeometry {
    setAttribute(name: string, attribute: object): void;
  }
  export class Float32BufferAttribute {
    constructor(array: number[], itemSize: number);
  }
  export class PointsMaterial {
    constructor(params?: object);
    opacity: number;
  }
  export class Points extends Object3D {
    constructor(geometry?: object, material?: object);
    frustumCulled: boolean;
  }
  export class SpriteMaterial {
    constructor(params?: object);
  }
  export class Sprite extends Object3D {
    constructor(material?: object);
  }
  export class Mesh extends Object3D {
    constructor(geometry?: object, material?: object);
  }
  export class SphereGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number);
  }
  export class MeshBasicMaterial {
    constructor(params?: object);
  }
  export class CanvasTexture {
    constructor(image: object);
    colorSpace: string;
  }
  export class Raycaster {
    ray: { origin: Vector3; direction: Vector3 };
    setFromCamera(pointer: Vector2, camera: Object3D): void;
    intersectObjects(objects: readonly Object3D[], recursive: boolean): { object: Object3D }[];
  }
  export const SRGBColorSpace: string;
  export const AdditiveBlending: number;
}
