/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registers tests synchronously */
import assert from "node:assert/strict";
import { test } from "node:test";

import { composePublishedPort } from "./doctor.ts";

test("composePublishedPort treats empty and :0 as unpublished", () => {
  assert.equal(composePublishedPort(""), undefined);
  assert.equal(composePublishedPort("\n"), undefined);
  assert.equal(composePublishedPort(":0"), undefined);
  assert.equal(composePublishedPort("0.0.0.0:0\n"), undefined);
  assert.equal(composePublishedPort("[::]:0"), undefined);
});

test("composePublishedPort keeps a real host mapping", () => {
  assert.equal(composePublishedPort("0.0.0.0:5432"), "0.0.0.0:5432");
  assert.equal(composePublishedPort("127.0.0.1:5432\n"), "127.0.0.1:5432");
  assert.equal(composePublishedPort("[::]:5432"), "[::]:5432");
});
