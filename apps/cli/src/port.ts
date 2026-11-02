import { createServer } from "node:net";

export type PortProbe = (port: number) => Promise<boolean>;

/** 最多往后试这么多个端口（3000 → 3099），避免在满载机器上无限扫描。 */
const PORT_SCAN_LIMIT = 100;

function tryListen(port: number, host: string): Promise<"free" | "busy" | "skip"> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", (error: NodeJS.ErrnoException) => {
      // EADDRINUSE 才算被占用；EADDRNOTAVAIL / EAFNOSUPPORT（没有 IPv6）等与占用无关。
      // EACCES（非 root 绑 1024 以下）也不算：真正绑端口的是 Docker 守护进程。
      resolve(error.code === "EADDRINUSE" ? "busy" : "skip");
    });
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => {
        resolve("free");
      });
    });
  });
}

/**
 * 宿主机 TCP 端口是否空闲。Docker 发布端口会绑 0.0.0.0 和 [::]；
 * macOS 上 Node 的 SO_REUSEADDR 让 0.0.0.0 能和 127.0.0.1 上的监听共存，所以三个都探一遍。
 */
export const hostPortFree: PortProbe = async (port) => {
  for (const host of ["0.0.0.0", "127.0.0.1", "::"]) {
    if ((await tryListen(port, host)) === "busy") return false;
  }
  return true;
};

/** 从 start 起找第一个空闲端口（含 start），最多试 limit 个；都占用时返回 undefined。 */
export async function findFreePort(
  start: number,
  probe: PortProbe = hostPortFree,
  limit = PORT_SCAN_LIMIT,
): Promise<number | undefined> {
  for (let port = start; port < start + limit && port <= 65535; port += 1) {
    if (await probe(port)) return port;
  }
  return undefined;
}

export type HostPortChoice = {
  readonly port: number;
  /** 想要的端口被占用，换成了 port。 */
  readonly movedFrom?: number;
};

/**
 * 选本机入口的宿主机端口。
 * - explicit（用户在 --yes 下用 HOST_PORT 明确指定）且被占用：报错，不悄悄换口。
 * - 其他情况（默认 3000、.env 里的旧值、交互输入）：被占用就往后找空闲口。
 */
export async function pickHostPort(
  wanted: number,
  explicit: boolean,
  probe: PortProbe = hostPortFree,
  limit = PORT_SCAN_LIMIT,
): Promise<HostPortChoice> {
  if (await probe(wanted)) return { port: wanted };
  if (explicit) {
    throw new Error(
      `HOST_PORT=${String(wanted)} 已被占用。换一个空闲端口，或不设 HOST_PORT 让安装自动选择。`,
    );
  }
  const port = await findFreePort(wanted + 1, probe, limit - 1);
  if (port === undefined) {
    const last = Math.min(65535, wanted + limit - 1);
    throw new Error(
      `端口 ${String(wanted)}-${String(last)} 都被占用，请用 HOST_PORT 指定一个空闲端口。`,
    );
  }
  return { port, movedFrom: wanted };
}
