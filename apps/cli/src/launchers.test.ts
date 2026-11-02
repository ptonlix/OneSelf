/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registers tests synchronously */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { installLaunchers, unixLauncher, windowsLauncher } from "./launchers.ts";

const skip = process.platform === "win32";

function tempRoot(): string {
  return realpathSync(mkdtempSync(path.join(tmpdir(), "oneself-launch-")));
}

test("no launchers without an installed CLI binary", async () => {
  const root = tempRoot();
  try {
    assert.equal(await installLaunchers(root, "linux"), false);
    assert.equal(existsSync(path.join(root, "oneself.sh")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("launchers carry no install logic, only forward to bin/oneself", () => {
  const sh = unixLauncher();
  assert.match(sh, /exec "\$bin" "\$@"/);
  assert.doesNotMatch(sh, /docker|compose|\.env|curl -/);
  const ps = windowsLauncher();
  assert.match(ps, /bin\\oneself\.exe/);
  assert.match(ps, /& \$bin @cliArgs/);
  assert.doesNotMatch(ps, /docker|compose|Invoke-WebRequest/);
});

test(
  "oneself.sh forwards args and its own dir; stale full installers removed",
  { skip },
  async () => {
    const root = tempRoot();
    try {
      mkdirSync(path.join(root, "bin"));
      mkdirSync(path.join(root, "deploy"));
      writeFileSync(path.join(root, "deploy", "oneself.sh"), "# old full installer\n");
      writeFileSync(path.join(root, "deploy", "oneself.ps1"), "# old full installer\n");
      const fake = path.join(root, "bin", "oneself");
      writeFileSync(
        fake,
        `#!/bin/sh\nprintf 'DIR=%s\\nARGS=%s\\n' "$ONESELF_DIR" "$*" > "${root}/out"\n`,
      );
      chmodSync(fake, 0o755);

      assert.equal(await installLaunchers(root), true);
      assert.equal(existsSync(path.join(root, "deploy", "oneself.sh")), false);
      assert.equal(existsSync(path.join(root, "deploy", "oneself.ps1")), false);
      assert.match(readFileSync(path.join(root, "oneself.ps1"), "utf8"), /\r\n/);

      const env = { PATH: "/usr/bin:/bin", ONESELF_DIR: "/elsewhere" };
      execFileSync(path.join(root, "oneself.sh"), ["update", "--dry-run"], { env, cwd: tmpdir() });
      assert.equal(
        readFileSync(path.join(root, "out"), "utf8"),
        `DIR=${root}\nARGS=update --dry-run\n`,
      );

      execFileSync(path.join(root, "oneself.sh"), [], { env, cwd: tmpdir() });
      assert.match(readFileSync(path.join(root, "out"), "utf8"), /ARGS=install\n/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test("oneself.sh fails clearly when bin/oneself is gone", { skip }, async () => {
  const root = tempRoot();
  try {
    mkdirSync(path.join(root, "bin"));
    writeFileSync(path.join(root, "bin", "oneself"), "#!/bin/sh\n");
    chmodSync(path.join(root, "bin", "oneself"), 0o755);
    await installLaunchers(root);
    rmSync(path.join(root, "bin", "oneself"));
    assert.throws(
      () => execFileSync(path.join(root, "oneself.sh"), ["doctor"], { stdio: "pipe" }),
      /找不到/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
