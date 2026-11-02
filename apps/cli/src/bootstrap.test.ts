/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registers tests synchronously */
// Exercises deploy/oneself-bootstrap.sh with a stubbed curl: which refs reach the CLI.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, "../../../deploy/oneself-bootstrap.sh");
const skip = process.platform === "win32";

function run(
  extraEnv: Record<string, string>,
  pinned?: string,
): { env: Record<string, string>; urls: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "oneself-boot-"));
  try {
    const stubBin = path.join(dir, "stub");
    mkdirSync(stubBin);
    // Fake CLI: dumps the env it received.
    const fake = `#!/bin/sh\nprintf 'REF=%s\\nREF_SET=%s\\nBUNDLED=%s\\nARGS=%s\\n' "\${ONESELF_REF-}" "\${ONESELF_REF+set}" "\${ONESELF_BUNDLED_REF-}" "$*" > "${dir}/out"\n`;
    const fakePath = path.join(dir, "fake-cli");
    writeFileSync(fakePath, fake);
    const sum = createHash("sha256").update(fake).digest("hex");
    const curl = `#!/bin/sh
out=; url=
while [ $# -gt 0 ]; do
  case "$1" in -o) out=$2; shift 2 ;; -*) shift ;; *) url=$1; shift ;; esac
done
echo "$url" >> "${dir}/urls"
case "$url" in
  */SHA256SUMS) for a in oneself-darwin-arm64 oneself-darwin-amd64 oneself-linux-amd64 oneself-linux-arm64 oneself-linux-amd64-musl oneself-linux-arm64-musl; do echo "${sum}  $a"; done > "$out" ;;
  *) cp "${fakePath}" "$out" ;;
esac
`;
    writeFileSync(path.join(stubBin, "curl"), curl);
    chmodSync(path.join(stubBin, "curl"), 0o755);
    let body = readFileSync(script, "utf8");
    if (pinned) {
      body = body.replace(/^ONESELF_BOOTSTRAP_REF=.*$/m, `ONESELF_BOOTSTRAP_REF=${pinned}`);
    }
    const scriptPath = path.join(dir, "oneself.sh");
    writeFileSync(scriptPath, body);
    const env: Record<string, string> = {
      PATH: `${stubBin}:/usr/bin:/bin:/usr/sbin:/sbin`,
      HOME: dir,
      XDG_CACHE_HOME: path.join(dir, "cache"),
      ...extraEnv,
    };
    execFileSync("sh", [scriptPath], { env, stdio: ["ignore", "ignore", "pipe"] });
    const parsed: Record<string, string> = {};
    for (const line of readFileSync(path.join(dir, "out"), "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0) parsed[line.slice(0, i)] = line.slice(i + 1);
    }
    return { env: parsed, urls: readFileSync(path.join(dir, "urls"), "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("pinned bootstrap exports only BUNDLED_REF, never ONESELF_REF", { skip }, () => {
  const { env, urls } = run({}, "v1.2.0");
  assert.equal(env.REF_SET, "");
  assert.equal(env.BUNDLED, "v1.2.0");
  assert.equal(env.ARGS, "install");
  assert.match(urls, /releases\/download\/v1\.2\.0\//);
});

test("repo copy (latest) does not export ONESELF_REF either", { skip }, () => {
  const { env, urls } = run({});
  assert.equal(env.REF_SET, "");
  assert.equal(env.BUNDLED, "latest");
  assert.match(urls, /releases\/latest\/download\//);
});

test("empty ONESELF_REF counts as unset", { skip }, () => {
  const { env } = run({ ONESELF_REF: "" }, "v1.2.0");
  assert.equal(env.REF_SET, "");
  assert.equal(env.BUNDLED, "v1.2.0");
});

test("user-set ONESELF_REF is passed through as forced", { skip }, () => {
  const { env, urls } = run({ ONESELF_REF: "v1.1.0" }, "v1.2.0");
  assert.equal(env.REF, "v1.1.0");
  assert.equal(env.REF_SET, "set");
  assert.equal(env.BUNDLED, "v1.1.0");
  assert.match(urls, /releases\/download\/v1\.1\.0\//);
});

test("invalid ONESELF_REF is rejected before download", { skip }, () => {
  assert.throws(() => run({ ONESELF_REF: "main;rm" }, "v1.2.0"));
});
