import { expect, it } from "vitest";

import { createServer } from "../../apps/server/src/index.js";
import { addSource, boot, login, markdown, ORIGIN, owner, putPage, readJson } from "./support.js";

it("refuses to start without an owner and does not create an API key", async () => {
  await expect(createServer({ publicOrigin: ORIGIN })).rejects.toThrow(/owner/);
  const server = await boot();
  const cookie = await owner(server);
  const listed = await server.request("/pcp/v1/api-keys", { headers: { cookie } });
  expect(await readJson(listed)).toEqual({ api_keys: [] });
  await server.close();
});

it("blocks writes until the owner changes the bootstrap password", async () => {
  const server = await boot();
  const cookie = await login(server);
  await addSource(server, cookie, "notes").catch(() => undefined);
  const response = await putPage(server, cookie, "notes", "hello", markdown("secret"));
  expect(response.status).toBe(403);
  const body = await readJson(response);
  expect(body.error).toBe("password_change_required");
  expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  expect(await server.runtime.objectStore.list("")).toEqual([]);
  await server.close();
});
