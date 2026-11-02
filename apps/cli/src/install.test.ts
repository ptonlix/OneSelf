/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registers tests synchronously */
import assert from "node:assert/strict";
import { test } from "node:test";

import { askText, updateHints } from "./install.ts";
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
});
