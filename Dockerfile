# OneSelf application image. Ingress containers stay outside this image.
FROM node:24-bookworm-slim AS build
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY skills ./skills
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @oneself/admin build && pnpm --filter @oneself/original-pages build
RUN node --input-type=module - <<'JS'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const root = "packages/original-pages";
const out = "/out/original-page-source.zip";
const skip = new Set(["dist", "node_modules", ".git"]);
mkdirSync("/out", { recursive: true });

const files = [];
const walk = (directory) => {
  for (const name of readdirSync(directory)) {
    const full = join(directory, name);
    if (statSync(full).isDirectory()) {
      if (!skip.has(name)) {
        walk(full);
      }
      continue;
    }
    files.push(full);
  }
};
walk(root);

const locals = [];
const centrals = [];
let offset = 0;
for (const full of files) {
  const path = relative(root, full).split(sep).join("/");
  const data = readFileSync(full);
  const name = Buffer.from(path);
  const compressed = deflateRawSync(data);
  const checksum = crc32(data);
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  name.copy(central, 46);
  locals.push(local, compressed);
  centrals.push(central);
  offset += local.length + compressed.length;
}
const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralSize, 12);
eocd.writeUInt32LE(offset, 16);
writeFileSync(out, Buffer.concat([...locals, ...centrals, eocd]));
JS

FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY skills ./skills
COPY --from=build /src/apps/admin/dist ./apps/admin/dist
COPY --from=build /src/packages/original-pages/dist ./packages/original-pages/dist
COPY --from=build /out/original-page-source.zip ./packages/original-pages/original-page-source.zip
RUN pnpm install --frozen-lockfile --prod
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "apps/server/src/index.ts"]
