# Proposal

## Why

`oneself update` 为了知道最新正式版，会匿名调用 `https://api.github.com/repos/<ONESELF_REPO>/releases/latest`。`ONESELF_REPO` 是 `owner/repo`，默认 `ptonlix/OneSelf`。这个接口每 IP 每小时只有 60 次，用完就返回 403，升级在拉镜像之前停住。要的版本号和 compose 包都在 `github.com` 的 Release 上，不该走 REST API。

## What Changes

- 解析 `latest` 时请求 `https://github.com/<ONESELF_REPO>/releases/latest`，从跳转到的 `/releases/tag/<tag>` 取出标签。`ONESELF_REPO` 是 `owner/repo`，默认 `ptonlix/OneSelf`。换一个 `ONESELF_REPO` 就查那个仓库；跳到别的仓库则失败。
- 不再调用 `api.github.com`，也不在失败时退回该接口，也不改用 Docker Hub 判断版本。
- 已知具体标签后，compose 包和校验和仍从 `https://github.com/<ONESELF_REPO>/releases/download/<tag>/` 下载。镜像仍由 `docker compose pull` 从 Docker Hub 拉取。
- 比较、不降级、查询失败则停在 `docker compose pull` 之前，这些规则不变。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `host-install`：`latest` 仍解析 GitHub 最新正式版，但必须走 `https://github.com/<ONESELF_REPO>/releases/latest` 的跳转，不得调用 Releases REST API。`ONESELF_REPO` 默认 `ptonlix/OneSelf`。新要求以本变更自己的 delta 为准，不改 `host-install-cli` 的规格。该能力目前只写在未归档变更 `host-install-cli` 里，`openspec/specs/` 还没有对应文件；本变更要等 `openspec/specs/host-install` 出现后才能 sync。

## Impact

- `apps/cli` 的 `resolveTag` 和相关测试。
- 行为落地后，`docs/ARCHITECTURE.md` 补一句：版本查询走 `github.com` 跳转，不走 `api.github.com`。跳转尚未发出。
- 不改发现文档、产品 Skill、镜像标签格式，也不改启动脚本已经在用的 `releases/latest/download` 入口。
