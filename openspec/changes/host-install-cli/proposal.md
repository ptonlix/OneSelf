# Proposal

## Why

宿主安装需要一份对外契约：钉版本、校验安装包与二进制、非交互与终端提问、入口互斥、升级不覆盖口令。半成品 CLI 曾险些取代 `curl|sh`，且误用仿冒 Bun Action。两套完整安装器（POSIX shell + CLI）已经在降级判断、版本比较、`--yes` 校验上漂移过，维护成本高。要把「唯一的 CLI 实现 + 薄公开入口」写成可验收的规范。

## What Changes

- 公开安装入口仍是 Release 上的 `oneself.sh` / `oneself.ps1`：薄启动脚本下载**校验过的**本平台 CLI 二进制，Unix 把已打开的终端描述符复制到 stdin 再执行（不新开 `/dev/tty`）。
- 宿主安装与运维只有一套实现：`apps/cli`。**删除**完整的 `deploy/oneself.sh` / `deploy/oneself.ps1`（以及 `ONESELF_USE_CLI` 交接）；`oneself-compose.tar.gz` 只含 `compose.yaml`、`.env.example`、`deploy/Caddyfile`。
- 安装目录内的 `oneself.sh` / `oneself.ps1` 由 CLI 生成，只转调 `bin/oneself`，不含安装逻辑；旧 Release 留下的 `deploy/oneself.*` 在下次 install / update 时删除。
- CLI 必须：写 `.oneself-release`、钉 `ONESELF_IMAGE`、校验 `oneself-compose.tar.gz` 的 SHA256、再装时同步/拒绝无意义降级、停掉其它入口、`--yes` / `ONESELF_YES`、安装后留下 `bin/oneself` 与薄 launcher。
- Release 工作流先编二进制并上传资产与扁平 `SHA256SUMS`，再 push 镜像。Bun 使用官方 `oven-sh/setup-bun`。
- Linux 同时尽量提供 musl 资产（`oneself-linux-*-musl`）；Alpine 用它；没有该资产时启动脚本失败并提示等带 musl 资产的 Release，不回退到 shell。

## Capabilities

### New Capabilities

- `host-install`: 宿主公开安装、升级、doctor、备份入口与 Release 资产契约。

### Modified Capabilities

- 无。`ingress` 尚在 `oneself-mvp` 变更里未归档，默认 `local` 入口与其限流地址直接写在 `openspec/changes/oneself-mvp/specs/ingress/spec.md`。

## Impact

- `.github/workflows/release-image.yml`、`deploy/oneself-bootstrap.*`、删除 `deploy/oneself.sh` / `oneself.ps1`、`apps/cli`、README / ARCHITECTURE。
