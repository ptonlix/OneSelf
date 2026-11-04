## 为什么 / Why

<!-- 一句话说这次改动要解决的问题。One sentence on the problem this change addresses. -->

## 行为 / Behavior

<!-- 没有对外行为变化就写「无」。有变化就写清调用方会看到什么。
     Write "none" when external behavior does not change. Otherwise say what a caller will see. -->

- 对外行为：
- OpenSpec：不适用，或写明已按要求实现的变更目录（`openspec/changes/<name>/`）。未要求时不要归档。

## 验证 / Verification

- [ ] 改了代码、测试、发现文档或产品 Skill：跑过 `pnpm check`
- [ ] 只改了文档：对改过的文件跑过 `pnpm exec prettier --check`，并写明依据的是哪一份现有文档
- [ ] 没有把所属人密码、API Key 原文、OAuth 刷新令牌、对象存储密钥或 `data:export` 导出包写进提交

## 截图 / Screenshots

<!-- 改了管理端或内置公开页时附上。没有就删掉这一节。
     Attach some when the admin UI or the built-in public page changed. Otherwise delete this section. -->
