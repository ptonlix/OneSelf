# Design

## Decisions

1. **公开入口是 bootstrap，契约在 CLI。** `curl|sh` 只负责选资产、核对 SHA256SUMS、`exec` 并在 Unix 上重定向 `</dev/tty`。钉版本、compose 校验、入口互斥由 CLI 完成。
2. **SHA256SUMS 第二列必须是下载文件名。** CI 把二进制摊平到 `RUNNER_TEMP` 再 `sha256sum`，避免 `oneself-bin/…` 路径导致 `sha256sum -c` / awk 对不上。
3. **先资产后镜像。** 编二进制与上传 Release 失败时不 push Docker Hub，避免 Hub 有标签而 GitHub 资产残缺。
4. **musl 可选。** Bun 的 `bun-linux-*-musl` 目标失败时跳过，不阻断 glibc 资产；bootstrap 在 Alpine 上优先请求 `*-musl`。
5. **仿冒 Action 零容忍。** 只允许 `oven-sh/setup-bun`。
6. **「这份安装器的标签」和「用户强制的标签」分开传。** 启动脚本的 Release 标签只作为 `ONESELF_BUNDLED_REF` 下传；`ONESELF_REF` 保留给用户显式覆盖。CLI 的同步判断是纯函数（`apps/cli/src/ref.ts` `planBundleSync` / `planAfterResolve`）：未强制时已装版本更新就不动；`latest` 解析成具体标签后再比一次。这样旧 Release 的命令不会把站降回去，而 `ONESELF_REF=v旧版` 仍可显式回退。
7. **Windows 启动脚本按 `iex` 语境写。** 全部逻辑在子作用域里跑，`finally` 还原环境变量；不 `exit`，用 `throw`；用 `Start-Process -NoNewWindow -Wait -PassThru` 取退出码，并按 CommandLineToArgvW 规则给参数加引号。标准输入本身被重定向且没有 `--yes` 时，启动前就给出明确提示。
8. **`update` 与 `install` 共用同步路径。** `runUpdate` 先 `maybeSyncBundle` 再 pull/up。
9. **只有一套实现。** 不再维护完整 shell / PowerShell 安装器：两套逻辑已经在降级、`refNewer`、`--yes` 上漂移过。启动脚本只做选资产、校验、交接；安装目录里的 `oneself.sh` / `oneself.ps1` 由 CLI 写出（`apps/cli/src/launchers.ts`），只设 `ONESELF_DIR` 并 `exec bin/oneself`。复制自身二进制时走临时文件 + rename，且跳过「复制到自己」，以便 `bin/oneself update` / `~/.local/bin/oneself` 自更新不截断正在运行的文件。

## Risks

- curl|sh 在无 `/dev/tty` 环境只能靠 `--yes` + 环境变量。
- Windows 控制台继承只在 Linux pwsh 上用桩验证过；PowerShell 5.1 与真实控制台仍需手测（tasks 1.7）。
- 若用户的 PowerShell 本身 stdin 就被重定向（例如被别的程序管道调用），子进程同样拿不到 TTY，只能走 `--yes`。
- musl 目标随 Bun 版本变化；某个 Release 编不出 musl 时 Alpine 用户只能等下一个 Release（或换 glibc 主机），没有 shell 后备。
- 没有纯 shell 路径：没有二进制的平台（例如 Windows arm64、FreeBSD）装不了。
- 旧 Release 装出来的安装目录里，`./oneself.sh` 仍是旧的完整 shell；要等用户用新 Release 的启动脚本跑一次 install / update 才会换成薄 launcher。
