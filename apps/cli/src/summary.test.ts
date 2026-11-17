import { expect, it } from "vitest";

import { shellHomePath } from "./self-bin.ts";
import {
  formatInstallSummary,
  formatUpdateSummary,
  oneselfSkillDigest,
  skillChanged,
} from "./summary.ts";
import {
  SKILL_AFTER_ATTEMPTS,
  SKILL_AFTER_DELAY_MS,
  SKILL_AFTER_TIMEOUT_MS,
  readDigestUntilReady,
  stripOneTrailingSlash,
} from "./update.ts";

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const root = "/home/a/.local/share/oneself";
const origin = "http://10.0.0.2:3001";

it("install summary leads with success, then home, admin and agent", () => {
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
  expect(lines[0] ?? "").toMatch(/^✓ OneSelf 安装成功/);
  expect(out).not.toContain("下一步");
  // Home page comes first, as its own section with the bare origin on one line.
  const home = out.indexOf("首页");
  expect(lines.some((l) => l.trim() === origin)).toBe(true);
  const admin = out.indexOf(`${origin}/admin`);
  const agent = out.indexOf(`npx skills add ${origin} -a <agent> -s oneself -y`);
  const device = out.indexOf("/admin/device");
  const apiKey = out.indexOf("API Key");
  const ops = out.indexOf("oneself update | doctor | backup | restore");
  expect(home).toBeGreaterThan(0);
  expect(admin).toBeGreaterThan(home);
  expect(agent).toBeGreaterThan(admin);
  expect(device).toBeGreaterThan(agent);
  expect(ops).toBeGreaterThan(agent);
  expect(apiKey === -1 || device < apiKey).toBe(true);
  expect(out).toContain(".well-known/pcp");
  expect(out).toContain('export PATH="$HOME/.local/share/oneself/bin:$PATH"');
  expect(out).toContain("公网访问");
  expect(out).toContain(`安装目录 ${root}`);
  // Commands sit alone on their own line (only indentation before them).
  expect(lines.some((l) => l.trim() === `npx skills add ${origin} -a <agent> -s oneself -y`)).toBe(
    true,
  );
});

it("install summary hides PATH hint when linked and public hint off local", () => {
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
  expect(out).not.toContain("PATH");
  expect(out).not.toContain("公网访问");
});

it("install summary falls back to launcher update without a binary", () => {
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
  expect(out).toContain(`${root}/oneself.sh update`);
});

it("update summary leads with success and does not claim an unchecked GitHub lookup", () => {
  const out = plain(formatUpdateSummary(root, undefined, "linux"));
  expect(out.split("\n")[0] ?? "").toMatch(/^✓ OneSelf 已更新/);
  expect(out).toContain("不覆盖口令");
  expect(out).not.toContain("已核对 GitHub");
});

it("update summary explains a no-op pull only after a latest check", () => {
  const out = plain(formatUpdateSummary(root, undefined, "linux", true));
  expect(out).toContain("没有新版本时，只重新拉取当前镜像");
  expect(out).toContain("不覆盖口令");
  expect(out).not.toContain("发现 oneself skill 有更新");
});

it("update summary explains a skill change with both commands", () => {
  const out = plain(formatUpdateSummary(root, undefined, "linux", false, origin));
  expect(out).toContain("发现 oneself skill 有更新，请升级 skill");
  expect(out).toContain("全新安装");
  expect(out).toContain(`npx skills add ${origin} -a <agent> -s oneself -y`);
  expect(out).toContain("已安装升级");
  expect(out).toContain("npx skills update oneself");
});

it("skill change is only a digest difference", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const body = JSON.stringify({ skills: [{ name: "oneself", digest }] });
  expect(oneselfSkillDigest(body)).toBe(digest);
  expect(oneselfSkillDigest("{")).toBeNull();
  expect(skillChanged(digest, `sha256:${"b".repeat(64)}`)).toBe(true);
  expect(skillChanged(null, digest)).toBe(false);
  expect(skillChanged(digest, null)).toBe(false);
  expect(skillChanged(digest, digest)).toBe(false);
});

it("shellHomePath shortens paths under home only", () => {
  expect(shellHomePath("/home/a/.local/share/oneself/bin", "/home/a")).toBe(
    "$HOME/.local/share/oneself/bin",
  );
  expect(shellHomePath("/home/ab/x", "/home/a")).toBe("/home/ab/x");
  expect(shellHomePath("/opt/oneself/bin", "/home/a")).toBe("/opt/oneself/bin");
});

it("strips one trailing slash and does not otherwise rewrite the origin", () => {
  expect(stripOneTrailingSlash("http://10.0.0.2:3001/")).toBe("http://10.0.0.2:3001");
  expect(stripOneTrailingSlash("http://10.0.0.2:3001//")).toBe("http://10.0.0.2:3001/");
  expect(stripOneTrailingSlash("http://10.0.0.2:3001")).toBe("http://10.0.0.2:3001");
  expect(stripOneTrailingSlash(" http://10.0.0.2:3001/")).toBe(" http://10.0.0.2:3001");
});

it("retries the after-read briefly and omits the notice when it never succeeds", async () => {
  const digest = `sha256:${"c".repeat(64)}`;
  const sleeps: number[] = [];
  let calls = 0;
  await expect(
    readDigestUntilReady(
      () => {
        calls += 1;
        return Promise.resolve(calls === 2 ? digest : null);
      },
      {
        attempts: 4,
        delayMs: 25,
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
      },
    ),
  ).resolves.toBe(digest);
  expect(calls).toBe(2);
  expect(sleeps).toEqual([25]);

  calls = 0;
  sleeps.length = 0;
  await expect(
    readDigestUntilReady(
      () => {
        calls += 1;
        return Promise.reject(new Error("down"));
      },
      {
        attempts: 3,
        delayMs: 10,
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
      },
    ),
  ).resolves.toBeNull();
  expect(calls).toBe(3);
  expect(sleeps).toEqual([10, 10]);
  expect(skillChanged(digest, null)).toBe(false);
});

it("bounds the post-restart skill read to a few short attempts", () => {
  expect(SKILL_AFTER_ATTEMPTS).toBeGreaterThanOrEqual(3);
  expect(SKILL_AFTER_ATTEMPTS).toBeLessThanOrEqual(6);
  expect(SKILL_AFTER_DELAY_MS).toBeGreaterThan(0);
  expect(SKILL_AFTER_DELAY_MS).toBeLessThanOrEqual(1_000);
  const budget =
    SKILL_AFTER_ATTEMPTS * SKILL_AFTER_TIMEOUT_MS +
    (SKILL_AFTER_ATTEMPTS - 1) * SKILL_AFTER_DELAY_MS;
  expect(budget).toBeLessThanOrEqual(15_000);
});
