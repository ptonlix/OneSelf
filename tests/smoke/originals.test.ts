import { createHash } from "node:crypto";

import { expect, it } from "vitest";

import {
  addSource,
  boot,
  expectError,
  issueApiKey,
  markdown,
  ORIGIN,
  owner,
  PNG_BYTES,
  putPage,
  readJson,
  uploadPng,
} from "./support.js";

it("rejects an unsupported media type and creates no file", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const body = new FormData();
  body.set("file", new File([new Uint8Array([1, 2, 3])], "a.txt", { type: "text/plain" }));
  const uploaded = await server.request("/pcp/v1/files", {
    method: "POST",
    headers: { cookie },
    body,
  });
  await expectError(uploaded, 400, "invalid");
  expect(await readJson(await server.request("/pcp/v1/files", { headers: { cookie } }))).toEqual({
    files: [],
  });
  await server.close();
});

it("returns file_url metadata without the bytes", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const uploaded = await uploadPng(server, cookie);
  const response = await server.request(`/pcp/v1/files/${uploaded.id}`, { headers: { cookie } });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await readJson(response)).toEqual({
    id: uploaded.id,
    url: `${ORIGIN}/media/${uploaded.id}`,
    media_type: "image/png",
    byte_size: PNG_BYTES.byteLength,
    sha256: createHash("sha256").update(PNG_BYTES).digest("hex"),
  });
  await server.close();
});

it("keeps an uploaded file unattached until a page lists it", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("alpha"))).status).toBe(200);
  const uploaded = await uploadPng(server, cookie);
  const listed = await readJson(
    await server.request("/pcp/v1/files?source=notes&slug=hello", { headers: { cookie } }),
  );
  expect(listed).toEqual({ files: [] });
  const anon = await server.request(`/media/${uploaded.id}`);
  await expectError(anon, 404, "not_found");
  await server.close();
});

it("lets only the owner list unattached files", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const loose = await uploadPng(server, cookie);
  const attached = await uploadPng(server, cookie);
  expect(
    (
      await putPage(
        server,
        cookie,
        "notes",
        "hello",
        markdown("alpha", `files: [${attached.id}]\n`),
      )
    ).status,
  ).toBe(200);
  const listed = await readJson(await server.request("/pcp/v1/files", { headers: { cookie } }));
  expect(listed.files).toEqual([expect.objectContaining({ id: loose.id })]);
  expect(JSON.stringify(listed)).not.toContain(attached.id);
  const agent = await issueApiKey(server, cookie, {
    label: "reader",
    unrestricted_data: true,
    site_write: false,
  });
  const forbidden = await server.request("/pcp/v1/files", {
    headers: { authorization: `ApiKey ${agent.key}` },
  });
  await expectError(forbidden, 403, "forbidden");
  await server.close();
});

it("hides private media the same way as a missing file", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const uploaded = await uploadPng(server, cookie);
  expect(
    (
      await putPage(
        server,
        cookie,
        "notes",
        "hello",
        markdown("alpha", `files: [${uploaded.id}]\n`),
      )
    ).status,
  ).toBe(200);
  const hidden = await server.request(`/media/${uploaded.id}`);
  const missing = await server.request("/media/file_missing");
  expect(await readJson(hidden.clone())).toEqual(await readJson(missing.clone()));
  await expectError(hidden, 404, "not_found");
  await expectError(missing, 404, "not_found");
  await server.close();
});

it("returns public media bytes and media type", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const uploaded = await uploadPng(server, cookie);
  const written = await putPage(
    server,
    cookie,
    "notes",
    "hello",
    `---\ntype: note\ntitle: Note\nvisibility: public\nfiles: [${uploaded.id}]\n---\n\nalpha\n`,
  );
  expect(written.status, await written.clone().text()).toBe(200);
  const media = await server.request(`/media/${uploaded.id}`);
  expect(media.status).toBe(200);
  expect(media.headers.get("content-type")).toBe("image/png");
  expect(Array.from(new Uint8Array(await media.arrayBuffer()))).toEqual(Array.from(PNG_BYTES));
  await server.close();
});
