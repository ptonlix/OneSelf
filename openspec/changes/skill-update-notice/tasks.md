## 1. 管理端

- [x] 1.1 解析安装索引里 `oneself` 的 digest，并按 origin 记住所属人确认过的摘要。
- [x] 1.2 已接入且摘要未确认时，Skill 菜单显示红点，星图不放升级提示。Skill 页显示当前正文、两条可复制命令，以及相对上一份已确认正文的行对比。提示生效时才显示「发现 oneself skill 有更新，请升级 skill」和「已更新」。未接入时不点亮红点，静默记下当前摘要；读到正文时一并记下，没读到则不覆盖已有正文。
- [x] 1.3 `GET /admin/skill` 在浏览器直接打开或刷新时返回管理端文档。

## 2. 测试

- [x] 2.1 覆盖摘要变化、确认后隐藏，未接入时不点亮红点，以及星图不放升级提示。
- [x] 2.2 运行 `pnpm exec vitest run apps/admin/src/nebula.test.ts apps/admin/src/http.test.ts apps/admin/src/continuity.test.ts apps/admin/src/skill-view.test.ts`。未通过前不把对应项标成完成。

## 3. CLI

- [x] 3.1 `oneself update` 在重启前读安装索引，重启后短重试再读。`oneself` 摘要不同时，在终端说明里给出全新安装和 `npx skills update oneself`。摘要相同、dry-run 或任一次读不到时不显示，读不到也不让更新失败。dry-run 在重试读取之前返回。
