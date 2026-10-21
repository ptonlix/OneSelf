import type { Clock, ObjectHead, ObjectStore, StoredObject } from "@oneself/ports";

/**
 * In-memory ObjectStore for tests.
 * The production entry does not export this.
 */
export function memoryObjectStore(clock: Clock): ObjectStore {
  const objects = new Map<string, StoredObject>();
  return {
    put(key, body) {
      const existing = objects.get(key);
      if (existing !== undefined) {
        return Promise.resolve({ created: false });
      }
      const storedBody = copyBytes(body);
      objects.set(key, {
        key,
        body: storedBody,
        byteSize: storedBody.byteLength,
        writtenAt: copyDate(clock.now()),
      });
      return Promise.resolve({ created: true });
    },
    get(key) {
      const stored = objects.get(key);
      if (stored === undefined) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        key: stored.key,
        byteSize: stored.byteSize,
        writtenAt: copyDate(stored.writtenAt),
        body: copyBytes(stored.body),
      });
    },
    delete(key) {
      objects.delete(key);
      return Promise.resolve();
    },
    list(prefix) {
      const heads: ObjectHead[] = [];
      for (const stored of objects.values()) {
        if (!stored.key.startsWith(prefix)) {
          continue;
        }
        heads.push({
          key: stored.key,
          byteSize: stored.byteSize,
          writtenAt: copyDate(stored.writtenAt),
        });
      }
      return Promise.resolve(heads);
    },
  };
}

function copyBytes(body: Uint8Array): Uint8Array {
  const copy = new Uint8Array(body.byteLength);
  copy.set(body);
  return copy;
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
