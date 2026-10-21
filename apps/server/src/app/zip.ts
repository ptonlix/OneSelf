import { inflateRawSync } from "node:zlib";

import { MAX_SITE_ARCHIVE_BYTES } from "@oneself/domain";

export type ZipEntry = {
  readonly path: string;
  readonly directory: boolean;
  readonly symlink: boolean;
  readonly data: Uint8Array;
};

export type ZipReadResult =
  | { readonly ok: true; readonly entries: readonly ZipEntry[] }
  | { readonly ok: false; readonly message: string };

export function readZip(bytes: Uint8Array): ZipReadResult {
  if (bytes.byteLength > MAX_SITE_ARCHIVE_BYTES) {
    return { ok: false, message: "archive exceeds the site upload limit" };
  }
  const eocd = findEocd(bytes);
  if (eocd === null) {
    return { ok: false, message: "archive is not a zip" };
  }
  const count = readU16(bytes, eocd + 10);
  const directoryOffset = readU32(bytes, eocd + 16);
  if (count === null || directoryOffset === null) {
    return { ok: false, message: "archive is not a zip" };
  }
  const entries: ZipEntry[] = [];
  let offset = directoryOffset;
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (readU32(bytes, offset) !== 0x02014b50) {
      return { ok: false, message: "archive central directory is invalid" };
    }
    const flags = readU16(bytes, offset + 8);
    const method = readU16(bytes, offset + 10);
    const compressedSize = readU32(bytes, offset + 20);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const externalAttributes = readU32(bytes, offset + 38);
    const localOffset = readU32(bytes, offset + 42);
    if (
      flags === null ||
      method === null ||
      compressedSize === null ||
      nameLength === null ||
      extraLength === null ||
      commentLength === null ||
      externalAttributes === null ||
      localOffset === null
    ) {
      return { ok: false, message: "archive central directory is invalid" };
    }
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const path = decodePath(bytes.subarray(nameStart, nameEnd));
    if (path === null) {
      return { ok: false, message: "archive path is not utf-8" };
    }
    const mode = (externalAttributes >>> 16) & 0o170000;
    const symlink = mode === 0o120000;
    const directory = path.endsWith("/");
    const data = directory
      ? new Uint8Array()
      : readLocal(bytes, localOffset, method, compressedSize, flags);
    if (data === null) {
      return { ok: false, message: "archive entry could not be read" };
    }
    total += data.byteLength;
    if (total > MAX_SITE_ARCHIVE_BYTES) {
      return { ok: false, message: "archive exceeds the site upload limit" };
    }
    entries.push({ path, directory, symlink, data });
    offset = nameEnd + extraLength + commentLength;
  }
  return { ok: true, entries };
}

export function writeStoredZip(
  files: readonly { readonly path: string; readonly data: Uint8Array }[],
): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.path, "utf8");
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(file.data.byteLength, 18);
    local.writeUInt32LE(file.data.byteLength, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const crc = crc32(file.data);
    local.writeUInt32LE(crc, 14);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.byteLength, 20);
    central.writeUInt32LE(file.data.byteLength, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    locals.push(local, file.data);
    centrals.push(central);
    offset += local.length + file.data.byteLength;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const central of centrals) {
    centralSize += central.length;
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  const parts = [...locals, ...centrals, eocd];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function readLocal(
  bytes: Uint8Array,
  offset: number,
  method: number,
  compressedSize: number,
  flags: number,
): Uint8Array | null {
  if ((flags & 0x1) !== 0) {
    return null;
  }
  if (readU32(bytes, offset) !== 0x04034b50) {
    return null;
  }
  const nameLength = readU16(bytes, offset + 26);
  const extraLength = readU16(bytes, offset + 28);
  if (nameLength === null || extraLength === null) {
    return null;
  }
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > bytes.length) {
    return null;
  }
  const compressed = bytes.subarray(dataStart, dataEnd);
  if (method === 0) {
    return compressed;
  }
  if (method !== 8) {
    return null;
  }
  try {
    return inflateRawSync(compressed);
  } catch {
    return null;
  }
}

function findEocd(bytes: Uint8Array): number | null {
  const minimum = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (readU32(bytes, offset) === 0x06054b50) {
      return offset;
    }
  }
  return null;
}

function readU16(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) {
    return null;
  }
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readU32(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) {
    return null;
  }
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function decodePath(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
