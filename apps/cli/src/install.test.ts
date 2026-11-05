/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registers tests synchronously */
import assert from "node:assert/strict";
import { test } from "node:test";

import { askText, profileForYes } from "./install.ts";
import { updateHints } from "./summary.ts";
import { originOk } from "./validate.ts";

const originPrompt = {
  message: "地址",
  validate(value: string) {
    return originOk(value) ? undefined : "bad origin";
  },
};

test("--yes still validates PUBLIC_ORIGIN from env", async () => {
  await assert.rejects(askText(originPrompt, true, "http://localhost"), /非交互参数无效/);
  await assert.rejects(
    askText(originPrompt, true, "https://evil.example.com/path"),
    /非交互参数无效/,
  );
  await assert.rejects(askText(originPrompt, true, ""), /非交互缺少必填项/);
  await assert.rejects(askText(originPrompt, true, undefined), /非交互缺少必填项/);
  assert.equal(
    await askText(originPrompt, true, " https://oneself.example.com "),
    "https://oneself.example.com",
  );
});

test("completion hints are platform-correct", () => {
  const win = updateHints("C:\\Users\\a\\AppData\\Local\\oneself", "win32").join("\n");
  assert.match(win, /oneself\.ps1" update/);
  assert.doesNotMatch(win, /oneself\.sh/);
  const unix = updateHints("/home/a/.local/share/oneself", "linux").join("\n");
  assert.match(unix, /\/home\/a\/\.local\/share\/oneself\/oneself\.sh update/);
  assert.doesNotMatch(unix, /ps1/);
  for (const hints of [win, unix]) {
    assert.match(hints, /\.oneself-release/);
    assert.match(hints, /ONESELF_IMAGE/);
    assert.match(hints, /CLI 二进制/);
  }
  assert.match(win, /irm … \| iex/);
  assert.match(unix, /curl … \| sh/);
});

test("--yes picks local ingress unless .env or COMPOSE_PROFILES says otherwise", () => {
  assert.equal(profileForYes("", undefined), "local");
  assert.equal(profileForYes("", ""), "local");
  assert.equal(profileForYes("", "caddy"), "caddy");
  assert.equal(profileForYes("tailscale", "caddy"), "tailscale");
  assert.throws(() => profileForYes("", "cloudflared,caddy"), /COMPOSE_PROFILES/);
});
