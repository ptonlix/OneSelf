import { chmod, readFile, writeFile } from "node:fs/promises";

export async function readEnvFile(path: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let raw = "";
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return map;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

export async function writeEnvValue(path: string, key: string, value: string): Promise<void> {
  if (value.includes("\n") || value.includes("\r")) {
    throw new Error(`${key} 不能含换行`);
  }
  let raw = "";
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const lines = raw.length === 0 ? [] : raw.split(/\r?\n/);
  const isKey = (line: string): boolean => {
    const eq = line.indexOf("=");
    return eq > 0 && line.slice(0, eq).trim() === key;
  };
  const found = lines.some(isKey);
  const next = lines.map((line) => (isKey(line) ? `${key}=${value}` : line));
  if (!found) {
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`${key}=${value}`);
  }
  await writeFile(path, next.join("\n").replace(/\n*$/, "\n"), {
    mode: 0o600,
  });
  await chmod(path, 0o600);
}
