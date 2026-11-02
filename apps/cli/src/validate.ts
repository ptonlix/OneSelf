import { networkInterfaces } from "node:os";

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
  if (!hostPortOk(rest)) return false;
  // Reject localhost / loopback with or without port.
  if (
    rest === "localhost" ||
    rest.startsWith("localhost:") ||
    rest === "127.0.0.1" ||
    rest.startsWith("127.0.0.1:")
  ) {
    return false;
  }
  return true;
}

/**
 * 本机/局域网入口的站点地址：local 代理只提供明文 HTTP、只发布 HOST_PORT，
 * 所以必须是 `http://主机:端口`（不接受 https，也不能省略端口，不能带路径）；
 * 允许 127.0.0.1 / localhost（只在本机访问时）。给了 hostPort 时端口必须与它一致。
 */
export function localOriginOk(origin: string, hostPort?: string): boolean {
  const value = origin.trim().replace(/\/$/, "");
  if (!value.startsWith("http://")) return false;
  const rest = value.slice("http://".length);
  if (!hostPortOk(rest)) return false;
  const colon = rest.lastIndexOf(":");
  if (colon === -1) return false;
  const port = rest.slice(colon + 1);
  if (hostPort !== undefined && port !== hostPort.trim()) return false;
  return true;
}

function hostPortOk(rest: string): boolean {
  if (rest === "" || /[/\s?#\\]/.test(rest) || rest.includes("@")) return false;
  if (rest === "example.invalid" || rest.endsWith(".example.invalid")) return false;
  if (/[^A-Za-z0-9._:-]/.test(rest)) return false;
  const colon = rest.indexOf(":");
  const host = colon === -1 ? rest : rest.slice(0, colon);
  if (host === "" || host.startsWith(".") || host.endsWith(".") || host.includes("..")) {
    return false;
  }
  if (colon !== -1 && !portOk(rest.slice(colon + 1))) return false;
  return true;
}

/** 1-65535 的十进制端口，不接受前导零（Compose 会把 03000 原样当字符串用）。 */
export function portOk(value: string): boolean {
  if (!/^[1-9][0-9]{0,4}$/.test(value)) return false;
  return Number(value) <= 65535;
}

/**
 * 站点地址是否适合所选入口：本机模式要求 http://主机:HOST_PORT（可以是回环地址），
 * 其余入口要求公网 https（ONESELF_ALLOW_HTTP=1 时放宽）。
 */
export function originOkFor(
  profile: string,
  origin: string,
  allowHttp = false,
  hostPort?: string,
): boolean {
  return profile === "local" ? localOriginOk(origin, hostPort) : originOk(origin, allowHttp);
}

export function secretOk(value: string): boolean {
  if (!value) return false;
  const bad = new Set(["change-me", "changeme", "password", "secret"]);
  if (bad.has(value)) return false;
  if (value.includes("$") || value.includes("`")) return false;
  return true;
}

/**
 * 访问入口。`local` 起一个只做明文 HTTP 转发的入口容器（Caddy），把 HOST_PORT 映射到宿主机，
 * 供本机/局域网访问；其余三个是公网或 tailnet 入口。应用容器本身始终不映射端口。
 */
export const INGRESS_PROFILES = ["local", "cloudflared", "caddy", "tailscale"] as const;

export type IngressProfile = (typeof INGRESS_PROFILES)[number];

export const DEFAULT_PROFILE: IngressProfile = "local";

export const DEFAULT_HOST_PORT = "3000";

export function profileOk(value: string): value is IngressProfile {
  return (INGRESS_PROFILES as readonly string[]).includes(value);
}

type Interfaces = ReturnType<typeof networkInterfaces>;

// 容器网桥、虚拟机网卡、VPN 隧道一般不是别的设备能访问到的地址：
// Linux docker0/br-*/veth/cni/flannel/calico/lxc/podman/virbr、macOS bridge*/utun/awdl/llw/anpi、
// Windows vEthernet (WSL / Default Switch)/Hyper-V/VirtualBox/VMware、各类 VPN（tailscale/zt/wg/tun/tap）。
const VIRTUAL_IFACE =
  /^(docker|br-|veth|virbr|cni|flannel|cali|kube|lxc|lxd|podman|vmnet|vboxnet|bridge|tailscale|zt|utun|tun|tap|wg|ipsec|awdl|llw|anpi|gif|stf|lo[0-9]*$)|vethernet|hyper-v|wsl|virtualbox|vmware|loopback|tailscale|zerotier|vpn/i;

/**
 * 探测本机物理网卡上的非回环 IPv4。只有虚拟网卡/网桥（docker0、vEthernet、bridge100…）时
 * 不去猜，直接回退 127.0.0.1，由安装流程明确警告，让用户自己填局域网或公网 IP。
 */
export function detectLanIPv4(ifaces: Interfaces = networkInterfaces()): string {
  const physical: string[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const info of list ?? []) {
      if (info.internal || info.family !== "IPv4") continue;
      if (info.address.startsWith("169.254.")) continue;
      if (VIRTUAL_IFACE.test(name)) continue;
      physical.push(info.address);
    }
  }
  return physical[0] ?? "127.0.0.1";
}

export function localOrigin(port: string, ip: string = detectLanIPv4()): string {
  return `http://${ip}:${port}`;
}
