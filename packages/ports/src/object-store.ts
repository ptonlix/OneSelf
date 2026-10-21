/**
 * Bytes addressed by an opaque key.
 * Callers never receive a disk path, bucket, or endpoint.
 * Page, original, and site objects all use this port.
 */
export interface ObjectStore {
  /**
   * Stores `body` at `key`.
   * When the key already exists, the stored bytes and `writtenAt` stay as they were
   * and `created` is false. Content-hash keys rely on that to avoid a rewrite.
   */
  put(key: string, body: Uint8Array): Promise<PutObjectResult>;

  /** The object, or null when the key is absent. */
  get(key: string): Promise<StoredObject | null>;

  /**
   * Removes the key.
   * An absent key still resolves, so a later cleanup can delete without checking first.
   */
  delete(key: string): Promise<void>;

  /**
   * Heads for keys that start with `prefix`, without their bodies.
   * An empty prefix lists every object. Order is not significant.
   * Rebuild lists the `pages/` prefix; orphan cleanup lists the whole store.
   */
  list(prefix: string): Promise<readonly ObjectHead[]>;
}

export interface PutObjectResult {
  /** True only when this call created the key. */
  readonly created: boolean;
}

/**
 * Metadata for one object.
 * `writtenAt` is the first successful put. Orphan cleanup compares it with the clock.
 * `byteSize` is the stored body length.
 */
export interface ObjectHead {
  readonly key: string;
  readonly byteSize: number;
  readonly writtenAt: Date;
}

export interface StoredObject extends ObjectHead {
  readonly body: Uint8Array;
}
