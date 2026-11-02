/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registers tests synchronously */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:net";
import { test } from "node:test";

import { findFreePort, hostPortFree, pickHostPort, type PortProbe } from "./port.ts";

const busy =
  (...ports: number[]): PortProbe =>
  (port) =>
    Promise.resolve(!ports.includes(port));

test("pickHostPort keeps a free port", async () => {
  assert.deepEqual(await pickHostPort(3000, false, busy()), { port: 3000 });
  assert.deepEqual(await pickHostPort(3000, true, busy()), { port: 3000 });
});

test("pickHostPort moves past occupied ports when not explicit", async () => {
  assert.deepEqual(await pickHostPort(3000, false, busy(3000, 3001)), {
    port: 3002,
    movedFrom: 3000,
  });
});

test("explicit HOST_PORT that is occupied fails with a clear reason", async () => {
  await assert.rejects(pickHostPort(3000, true, busy(3000)), /HOST_PORT=3000 已被占用/);
});

test("scan is bounded", async () => {
  const all: PortProbe = () => Promise.resolve(false);
  await assert.rejects(pickHostPort(3000, false, all, 5), /3000-3004 都被占用/);
  assert.equal(await findFreePort(65534, all), undefined);
  assert.equal(await findFreePort(65535, busy()), 65535);
});

test("hostPortFree sees a real listener and auto-pick skips it", async () => {
  const server: Server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "0.0.0.0", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const taken = address.port;
  try {
    assert.equal(await hostPortFree(taken), false);
    const choice = await pickHostPort(taken, false);
    assert.equal(choice.movedFrom, taken);
    assert.ok(choice.port > taken);
    await assert.rejects(pickHostPort(taken, true), /已被占用/);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
  assert.equal(await hostPortFree(taken), true);
});

test("hostPortFree also catches a loopback-only listener", async () => {
  const server: Server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    assert.equal(await hostPortFree(address.port), false);
  } finally {
    server.close();
  }
});
