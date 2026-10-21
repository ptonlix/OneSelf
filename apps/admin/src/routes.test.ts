import { describe, expect, it } from "vitest";
import { hrefFor, parseAdminRoute } from "./routes";

describe("admin routes", () => {
  it("keeps the device user code in the query", () => {
    const route = parseAdminRoute("/admin/device/", "?user_code=WDJB-MJHT");
    expect(route).toEqual({ name: "device", userCode: "WDJB-MJHT" });
    expect(hrefFor(route)).toBe("/admin/device?user_code=WDJB-MJHT");
  });

  it("round-trips approval ids", () => {
    const apiKey = parseAdminRoute("/admin/api-keys/req%201", "");
    const site = parseAdminRoute("/admin/site-activations/act%2F1", "");
    expect(apiKey).toEqual({ name: "api-key", id: "req 1" });
    expect(site).toEqual({ name: "unknown" });
    expect(hrefFor({ name: "api-key", id: "req 1" })).toBe("/admin/api-keys/req%201");
    expect(hrefFor({ name: "site", id: "act/1" })).toBe("/admin/site-activations/act%2F1");
  });

  it("reserves the new pages", () => {
    expect(parseAdminRoute("/admin/api-keys/new", "")).toEqual({ name: "api-key-new" });
    expect(parseAdminRoute("/admin/site-activations/new", "")).toEqual({ name: "site-new" });
    expect(parseAdminRoute("/admin", "")).toEqual({ name: "home" });
    expect(parseAdminRoute("/admin/login", "")).toEqual({ name: "login" });
    expect(parseAdminRoute("/admin/password", "")).toEqual({ name: "password" });
  });
});
