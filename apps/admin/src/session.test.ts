import { describe, expect, it } from "vitest";
import { AdminRequestError } from "./http";
import { sessionFromProbeFailure } from "./session";

describe("session probe", () => {
  it("keeps a gated owner on the password change", () => {
    expect(
      sessionFromProbeFailure(new AdminRequestError(403, "password_change_required", "必须先改密")),
    ).toEqual({ status: "password-change" });
  });

  it("treats a missing session as logged out", () => {
    expect(sessionFromProbeFailure(new AdminRequestError(401, "unauthorized", "需要登录"))).toEqual(
      {
        status: "anonymous",
        message: null,
      },
    );
  });
});
