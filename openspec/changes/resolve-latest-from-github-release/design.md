# Design

## Context

见 `proposal.md`。compose 包在 `github.com` 的 Release 资产里，应用镜像在 Docker Hub。缺的只是版本号。默认仓库 `https://github.com/ptonlix/OneSelf/releases/latest` 现在返回 302，跳到 `/releases/tag/v0.5.1`。本机已核对：对该 URL 发 HEAD 且 `redirect: "manual"` 时，Node 和 Bun 都返回 status 302，`type` 不是 `opaque`，`Location` 是 `https://github.com/ptonlix/OneSelf/releases/tag/v0.5.1`，`res.ok` 为 false。这和启动脚本已经在用的 `releases/latest/download/` 是同一类地址，不消耗 `api.github.com` 每小时 60 次的 core 限额。

## Goals / Non-Goals

**Goals:**

- 所有把 `latest` 解析成具体标签的路径都读这个跳转，包括 `update` 和显式 `ONESELF_REF=latest`。
- 查询失败时不退回 `api.github.com`，也不继续 pull。

**Non-Goals:**

- 不用 Docker Hub 标签列表判断版本。镜像仍由已钉的 `ONESELF_IMAGE` 经 `docker compose pull` 拉取。
- 不把 compose 包改存到 Docker Hub。
- 不改启动脚本，也不为查询准备 GitHub 令牌。

## Decisions

1. **只读跳转，不下载 Release 页面，也不跟随跳转。**  
   对 `https://github.com/<ONESELF_REPO>/releases/latest` 发 HEAD，`redirect: "manual"`，从 `Location` 取出标签。`ONESELF_REPO` 是 `owner/repo`，默认 `ptonlix/OneSelf`。  
   本机 Node 和 Bun 对默认仓库都返回 status 302，`type` 不是 `opaque`，`Location` 是 `https://github.com/ptonlix/OneSelf/releases/tag/v0.5.1`。这个 302 的 `res.ok` 为 false。不要把 `!res.ok` 当成失败，也不要因此退回 `api.github.com`。  
   接受指向同一 `ONESELF_REPO` 的绝对或相对 Location，路径必须是 `/releases/tag/<tag>`，且 `<tag>` 通过现有 `refOk`、不能是 `latest`。其他主机、其他仓库、没有 Location、或标签不合格，都算查询失败，并在 `docker compose pull` 之前停下。  
   备选：跟随跳转后再看最终 URL。多一次往返，还要把 HTML 页面拉下来，没有额外信息。不采用。

2. **不自己过滤预发布。**  
   GitHub 的 `/releases/latest` 已经排除草稿和预发布。跳到的标签就是最新正式版。具体标签仍原样使用，不发这次请求。

3. **资产下载保持现状。**  
   标签已知后继续从 `https://github.com/<ONESELF_REPO>/releases/download/<tag>/` 取 `oneself-compose.tar.gz` 和 `SHA256SUMS`。那也不是 REST API。

4. **帮助和结束语不写成规格口吻。**  
   用「有新版本就升级并重启，没有就重新拉取当前镜像」。不要「核对」「较新则」「已钉镜像」。错误仍说明无法读取 GitHub Release，实现和测试必须证明打的是 `github.com/.../releases/latest`，不是 `api.github.com`。

5. **不改 `host-install-cli` 的规格。**  
   `openspec/specs/` 里还没有 `host-install`。新要求只写在本变更自己的 delta 里，不要改 `openspec/changes/host-install-cli/specs/host-install/spec.md`。那份规格只要求解析 GitHub 最新正式版，并不要求 `api.github.com`；改它会让同一要求有两份正文，而且它的任务 2.9 已经勾选。先归档 `host-install-cli` 也不会把 API 调用写回去。本变更只能在 `openspec/specs/host-install` 存在之后再 sync。  
   行为落地后，再在 `docs/ARCHITECTURE.md` 补一句：`update` 用 `github.com` 的 `/releases/latest` 跳转读取最新正式版，不调用 Releases REST API。跳转尚未发出，文档不能写成已经上线。

## Risks / Trade-offs

- [已安装的旧二进制仍会打 API] → 要等带此行为的 Release 发出后才生效。当前 403 仍要等该 IP 的限额重置，或用启动脚本换二进制。
- [`github.com` 也可能因滥用返回 429/403] → 一次更新只多一次 HEAD，失败仍停在 pull 之前，不改走 API。
- [跳转目标暂时不可用，但 Docker Hub 已有镜像] → 接受。compose 包也在这个 Release 上，只知道镜像标签仍无法同步安装文件。

## Migration Plan

无数据迁移。新 CLI 解析 `latest` 时不再调用 `api.github.com`。回退是发一版恢复旧查询的 CLI；已写下的 `.oneself-release` 不需要改。

## Open Questions

无。
