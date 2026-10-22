import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const AGENT_SKILLS_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

export type ServedSkill = {
  readonly entry: Uint8Array;
  readonly context: Uint8Array;
  readonly publicPage: Uint8Array;
  readonly archive: Uint8Array;
  readonly digest: string;
  readonly description: string;
};

export function loadServedSkill(input: {
  readonly entry: string;
  readonly context: Uint8Array;
  readonly publicPage: Uint8Array;
  readonly origin: string;
}): ServedSkill {
  const description = skillDescription(input.entry);
  const entry = Buffer.from(injectSkillOrigin(input.entry, input.origin), "utf8");
  const archive = gzipSync(
    tar([
      { name: "SKILL.md", data: entry },
      { name: "references/context.md", data: input.context },
      { name: "references/public-page.md", data: input.publicPage },
    ]),
    { level: 9 },
  );
  // ZlibOptions has no mtime. Zero the gzip member time (bytes 4–7) so the served bytes stay stable.
  archive.fill(0, 4, 8);
  return {
    entry,
    context: input.context,
    publicPage: input.publicPage,
    archive,
    digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
    description,
  };
}

export function agentSkillsIndex(
  origin: string,
  description: string,
  digest: string,
): Record<string, unknown> {
  return {
    $schema: AGENT_SKILLS_SCHEMA,
    skills: [
      {
        name: "oneself",
        description,
        type: "archive",
        url: `${origin}/skills/oneself.tar.gz`,
        digest,
      },
    ],
  };
}

export function injectSkillOrigin(source: string, origin: string): string {
  if (!source.startsWith("---\n")) {
    throw new Error("skill frontmatter is missing");
  }
  const end = source.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new Error("skill frontmatter is unclosed");
  }
  const lines = source.slice(4, end).split("\n");
  const quoted = quoteYaml(origin);
  const metadataIndex = lines.findIndex((line) => line === "metadata:");
  if (metadataIndex < 0) {
    lines.push("metadata:", `  oneself_origin: ${quoted}`);
  } else {
    let insertAt = metadataIndex + 1;
    while (insertAt < lines.length && (lines[insertAt]?.startsWith(" ") ?? false)) {
      if (lines[insertAt]?.trimStart().startsWith("oneself_origin:") === true) {
        lines[insertAt] = `  oneself_origin: ${quoted}`;
        insertAt = -1;
        break;
      }
      insertAt += 1;
    }
    if (insertAt >= 0) {
      lines.splice(insertAt, 0, `  oneself_origin: ${quoted}`);
    }
  }
  const next = `---\n${lines.join("\n")}\n---\n${source.slice(end + "\n---\n".length)}`;
  if (!next.includes("name: oneself")) {
    throw new Error("skill name drifted");
  }
  if (!next.includes(`oneself_origin: ${quoted}`)) {
    throw new Error("skill origin was not written");
  }
  skillDescription(next);
  return next;
}

function skillDescription(source: string): string {
  const match = /^description:\s*(.+)$/m.exec(source);
  const description = match?.[1]?.trim() ?? "";
  if (description.length === 0 || description.length > 1024) {
    throw new Error("skill description is missing");
  }
  if (!description.includes("上下文") || !description.includes("公开宣传页")) {
    throw new Error("skill description must cover context and the public page");
  }
  return description;
}

function quoteYaml(value: string): string {
  if (value.includes("\n") || value.includes("\r")) {
    throw new Error("origin is not a single line");
  }
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function tar(files: readonly { name: string; data: Uint8Array }[]): Buffer {
  const parts: Buffer[] = [];
  for (const file of files) {
    parts.push(header(file.name, file.data.byteLength), Buffer.from(file.data));
    const padding = (512 - (file.data.byteLength % 512)) % 512;
    if (padding > 0) {
      parts.push(Buffer.alloc(padding));
    }
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

function header(name: string, size: number): Buffer {
  if (name.length === 0 || name.length > 100 || name.includes("\0")) {
    throw new Error("skill archive path is invalid");
  }
  const buf = Buffer.alloc(512);
  writeString(buf, name, 0, 100);
  writeString(buf, octal(0o644, 8), 100, 8);
  writeString(buf, octal(0, 8), 108, 8);
  writeString(buf, octal(0, 8), 116, 8);
  writeString(buf, octal(size, 12), 124, 12);
  writeString(buf, octal(0, 12), 136, 12);
  buf.fill(0x20, 148, 156);
  buf[156] = 0x30;
  writeString(buf, "ustar\0", 257, 6);
  writeString(buf, "00", 263, 2);
  let sum = 0;
  for (const byte of buf) {
    sum += byte;
  }
  writeString(buf, `${octal(sum, 7)} `, 148, 8);
  return buf;
}

function octal(value: number, length: number): string {
  return `${value.toString(8).padStart(length - 1, "0")}\0`;
}

function writeString(buf: Buffer, value: string, offset: number, length: number): void {
  const bytes = Buffer.from(value);
  bytes.copy(buf, offset, 0, Math.min(bytes.length, length));
}
