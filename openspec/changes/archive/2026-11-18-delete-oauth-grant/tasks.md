# Tasks

## 1. 删除授权记录

- [x] 1.1 所属人 `POST /admin/oauth-grants/{id}/delete` 先作废仍有效的授权，再写 `deleted_at`。不删除行。已作废的只写 `deleted_at`。缺失或已软删除为 `not_found`。用 `tests/smoke/access.test.ts` 验证列表没有该条、内存和投影仍留着这一行、旧 access token 不再被接受，以及 Agent 不能调用。
- [x] 1.2 概览和设备码页对每一行提供两步删除，成功后重新拉取。`apps/admin/src/views.test.ts` 断言已作废行可以确认删除，且第一次点击不发请求。更新 `docs/ARCHITECTURE.md` 的设备码步骤。不改 `docs/PRD.md`。
