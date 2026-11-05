# Tasks

## 1. 用 github.com 跳转解析 latest

- [ ] 1.1 在 `apps/cli` 把 `latest` 的解析改成 HEAD `https://github.com/<ONESELF_REPO>/releases/latest`，`redirect: "manual"`，从 `Location` 的 `/releases/tag/<tag>` 取出版本标签。不要用 `res.ok` 判断成功：该 302 的 `res.ok` 为 false，不能因此失败，也不能退回 `api.github.com`。接受指向同一 `ONESELF_REPO` 的绝对或相对 Location；其他主机或其他仓库失败。不跟随下载页面，不请求 `api.github.com`，失败不退回 API。具体标签不发这次请求。用单元测试验证：跳到 `v1.2.3` 时解析结果是 `v1.2.3` 且 URL 是 `github.com/.../releases/latest`；Location 缺失、跨仓库、其他主机或不是版本标签时失败；具体标签零请求。
- [ ] 1.2 更新同步失败路径的测试，确认查询失败仍在 `docker compose pull` 之前，且失败请求不是 `api.github.com`。跑 `apps/cli` 里相关 `*.test.ts` 确认通过。
- [ ] 1.3 行为落地之后，在 `docs/ARCHITECTURE.md` 写明 `update` 用 `github.com` 的 `/releases/latest` 跳转读取最新正式版，不调用 Releases REST API。这是尚未完成的实现任务，不要写成跳转已经发出。

## Workflow follow-up

- 本变更只能在 `openspec/specs/host-install` 存在之后再 sync。新要求以本变更自己的 delta 为准，不要改 `openspec/changes/host-install-cli/specs/host-install/spec.md`。先归档 `host-install-cli` 不会把 API 调用写回去：那份规格只要求解析 GitHub 最新正式版，并不要求 `api.github.com`。
