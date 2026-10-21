import { AdminRequestError } from "./http";

export type Session =
  | { readonly status: "loading" }
  | { readonly status: "anonymous"; readonly message: string | null }
  | { readonly status: "password-change" }
  | { readonly status: "ready" };

export function sessionFromProbeFailure(reason: unknown): Session {
  if (reason instanceof AdminRequestError && reason.code === "password_change_required") {
    return { status: "password-change" };
  }
  if (reason instanceof AdminRequestError && reason.code === "unauthorized") {
    return { status: "anonymous", message: null };
  }
  if (reason instanceof AdminRequestError) {
    return { status: "anonymous", message: reason.message };
  }
  return { status: "anonymous", message: "无法确认会话" };
}

export function isPasswordGate(reason: unknown): boolean {
  return reason instanceof AdminRequestError && reason.code === "password_change_required";
}

export function isUnauthorized(reason: unknown): boolean {
  return reason instanceof AdminRequestError && reason.code === "unauthorized";
}
