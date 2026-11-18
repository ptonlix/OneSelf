# Tasks

## 1. 保存标签和两个时刻

- [x] 1.1 追加迁移，给 `oauth_grants` 增加可空的 `label`、`last_used_at`、`refresh_expires_at`。不改已有迁移。`packages/db/src/schema.test.ts` 确认三列和可空。
- [x] 1.2 投影、适配器补丁和内存授权带上这三列。`POST /admin/device` 要求 trim 后 1 到 80 字符的 `label`，否则 `invalid` 且不批准。授权码测试路径仍插入空标签。用 `tests/smoke` 的设备码用例验证缺标签、空白、超长被拒绝，合法标签被保存。
- [x] 1.3 签发或轮换刷新令牌时写入适配器的 `expiresAt`；作废时清空。重启时装载该列，不再把已有到期改成现在加 30 天。access token 被接受时用应用时钟写 `last_used_at`，批准、换 token 和刷新不写。`GET /admin/oauth-grants` 返回 `label`、`last_used_at`、`expires_at`，不含令牌、哈希或载荷。用同一冒烟验证换 token、调用、刷新、作废和旧行。

## 2. 管理端分辨每一条

- [x] 2.1 批准页增加必填标签，提交体带上 trim 后的 `label`。概览标题用标签，没有标签时用缩短 id。活动行显示最近使用、批准时间和刷新到期；已作废行保留最近使用和作废时间，不显示到期，也没有作废按钮。`apps/admin/src/views.test.ts` 和 `http.test.ts` 覆盖这些形状，并继续拒绝令牌类字段。
- [x] 2.2 更新 `docs/ARCHITECTURE.md` 的 `oauth_grants` 说明和设备码批准步骤。不改 `docs/PRD.md`，不改产品 Skill。运行 `pnpm exec vitest run packages/db/src/schema.test.ts apps/admin/src/forms.test.ts apps/admin/src/http.test.ts apps/admin/src/views.test.ts tests/smoke/fixes.test.ts tests/smoke/access.test.ts`，再跑 `pnpm run typecheck`。

## Workflow follow-up

- 归档本变更时，把 `docs/PRD.md` 第 6 节的 `oauth_grants` 说明改成包含标签、最近使用和刷新到期。
