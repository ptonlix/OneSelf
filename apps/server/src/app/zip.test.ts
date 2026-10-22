import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { readZip, writeStoredZip } from "./zip.ts";

describe("readZip", () => {
  it("rejects an inflated entry larger than 20 MiB", () => {
    const huge = new Uint8Array(20 * 1024 * 1024 + 1);
    const compressed = deflateRawSync(huge);
    const archive = storedZipWithDeflated("index.html", compressed, huge.byteLength);
    const result = readZip(archive);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toContain("exceeds");
    expect(
      writeStoredZip([{ path: "index.html", data: new Uint8Array([1]) }]).byteLength,
    ).toBeGreaterThan(0);
  });
});

function storedZipWithDeflated(
  name: string,
  compressed: Uint8Array,
  uncompressedSize: number,
): Uint8Array {
  const pathBytes = Buffer.from(name, "utf8");
  const local = Buffer.alloc(30 + pathBytes.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.byteLength, 18);
  local.writeUInt32LE(uncompressedSize, 22);
  local.writeUInt16LE(pathBytes.length, 26);
  pathBytes.copy(local, 30);
  const central = Buffer.alloc(46 + pathBytes.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.byteLength, 20);
  central.writeUInt32LE(uncompressedSize, 24);
  central.writeUInt16LE(pathBytes.length, 28);
  central.writeUInt32LE(0, 42);
  pathBytes.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + compressed.byteLength, 16);
  const out = new Uint8Array(local.length + compressed.byteLength + central.length + eocd.length);
  out.set(local, 0);
  out.set(compressed, local.length);
  out.set(central, local.length + compressed.byteLength);
  out.set(eocd, local.length + compressed.byteLength + central.length);
  return out;
}
