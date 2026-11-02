export function originOk(origin: string, allowHttp = false): boolean {
  const value = origin.trim().replace(/\/$/, "");
  let rest: string;
  if (allowHttp && value.startsWith("http://")) {
    rest = value.slice("http://".length);
  } else if (value.startsWith("https://")) {
    rest = value.slice("https://".length);
  } else {
    return false;
  }
  if (rest === "" || /[/\s?#\\]/.test(rest) || rest.includes("@")) return false;
  if (rest === "example.invalid" || rest.endsWith(".example.invalid")) return false;
  // Reject localhost / loopback with or without port.
  if (
    rest === "localhost" ||
    rest.startsWith("localhost:") ||
    rest === "127.0.0.1" ||
    rest.startsWith("127.0.0.1:")
  ) {
    return false;
  }
  if (/[^A-Za-z0-9._:-]/.test(rest)) return false;
  const host = rest.includes(":") ? rest.slice(0, rest.indexOf(":")) : rest;
  if (host === "" || host.startsWith(".") || host.endsWith(".") || host.includes("..")) {
    return false;
  }
  return true;
}

export function secretOk(value: string): boolean {
  if (!value) return false;
  const bad = new Set(["change-me", "changeme", "password", "secret"]);
  if (bad.has(value)) return false;
  if (value.includes("$") || value.includes("`")) return false;
  return true;
}

export type IngressProfile = "cloudflared" | "caddy" | "tailscale";

export function profileOk(value: string): value is IngressProfile {
  return value === "cloudflared" || value === "caddy" || value === "tailscale";
}
