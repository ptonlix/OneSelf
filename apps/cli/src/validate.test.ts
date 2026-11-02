/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registers tests synchronously */
import assert from "node:assert/strict";
import { test } from "node:test";

import { originOk, profileOk, secretOk } from "./validate.ts";

test("originOk accepts https host and host:port", () => {
  assert.equal(originOk("https://oneself.example.com"), true);
  assert.equal(originOk("https://oneself.example.com:8443"), true);
  assert.equal(originOk("https://host.tailnet.ts.net"), true);
});

test("originOk rejects localhost, paths, dots, http by default", () => {
  assert.equal(originOk("https://localhost"), false);
  assert.equal(originOk("https://localhost:443"), false);
  assert.equal(originOk("https://127.0.0.1"), false);
  assert.equal(originOk("https://oneself.example.com/pcp"), false);
  assert.equal(originOk("https://.evil"), false);
  assert.equal(originOk("https://a..b"), false);
  assert.equal(originOk("http://oneself.example.com"), false);
  assert.equal(originOk("http://oneself.example.com", true), true);
});

test("secretOk and profileOk", () => {
  assert.equal(secretOk("change-me"), false);
  assert.equal(secretOk("good-secret"), true);
  assert.equal(profileOk("cloudflared"), true);
  assert.equal(profileOk("cloudflared,caddy"), false);
});
