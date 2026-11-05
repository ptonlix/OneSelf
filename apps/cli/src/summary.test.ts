/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registers tests synchronously */
import assert from "node:assert/strict";
import { test } from "node:test";

import { shellHomePath } from "./self-bin.ts";
import { formatInstallSummary, formatUpdateSummary } from "./summary.ts";

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const root = "/home/a/.local/share/oneself";
const origin = "http://10.0.0.2:3001";

test("install summary leads with success, then home, admin and agent", () => {
  const out = plain(
    formatInstallSummary({
      origin,
      root,
      localOnly: true,
      launchers: true,
      binary: {
        dest: `${root}/bin/oneself`,
        linked: undefined,
        pathHint: `echo 'export PATH="$HOME/.local/share/oneself/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc`,
      },
      platform: "linux",
    }),
  );
  const lines = out.split("\n");
  assert.match(lines[0] ?? "", /^✓ OneSelf 安装成功/);
  assert.doesNotMatch(out, /下一步/);
  // Home page comes first, as its own section with the bare origin on one line.
  const home = out.indexOf("首页");
  assert.ok(lines.some((l) => l.trim() === origin));
  const admin = out.indexOf(`${origin}/admin`);
  const agent = out.indexOf(`npx skills add ${origin} -a <agent> -s oneself -y`);
  const device = out.indexOf("/admin/device");
  const apiKey = out.indexOf("API Key");
  const ops = out.indexOf("oneself update | doctor | backup | restore");
  assert.ok(home > 0 && admin > home && agent > admin && device > agent && ops > agent);
  assert.ok(apiKey === -1 || device < apiKey);
  assert.match(out, /\.well-known\/pcp/);
  assert.match(out, /export PATH="\$HOME\/\.local\/share\/oneself\/bin:\$PATH"/);
  assert.match(out, /公网访问/);
  assert.match(out, new RegExp(`安装目录 ${root}`));
  // Commands sit alone on their own line (only indentation before them).
  assert.ok(lines.some((l) => l.trim() === `npx skills add ${origin} -a <agent> -s oneself -y`));
});

test("install summary hides PATH hint when linked and public hint off local", () => {
  const out = plain(
    formatInstallSummary({
      origin: "https://me.example.com",
      root,
      localOnly: false,
      launchers: true,
      binary: { dest: `${root}/bin/oneself`, linked: "/home/a/.local/bin/oneself", pathHint: "x" },
      platform: "linux",
    }),
  );
  assert.doesNotMatch(out, /PATH/);
  assert.doesNotMatch(out, /公网访问/);
});

test("install summary falls back to launcher update without a binary", () => {
  const out = plain(
    formatInstallSummary({
      origin,
      root,
      localOnly: false,
      launchers: true,
      binary: undefined,
      platform: "linux",
    }),
  );
  assert.ok(out.includes(`${root}/oneself.sh update`));
});

test("update summary leads with success", () => {
  const out = plain(formatUpdateSummary(root, undefined, "linux"));
  assert.match(out.split("\n")[0] ?? "", /^✓ OneSelf 已更新/);
  assert.match(out, /不覆盖口令/);
});

test("shellHomePath shortens paths under home only", () => {
  assert.equal(
    shellHomePath("/home/a/.local/share/oneself/bin", "/home/a"),
    "$HOME/.local/share/oneself/bin",
  );
  assert.equal(shellHomePath("/home/ab/x", "/home/a"), "/home/ab/x");
  assert.equal(shellHomePath("/opt/oneself/bin", "/home/a"), "/opt/oneself/bin");
});
