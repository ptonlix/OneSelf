## 1. 入口

- [x] 1.1 把 `skills/oneself/SKILL.md` 的连接配置改成 `current` 与按 origin 分开的 `profiles`，写明四段选择顺序、点名不改默认、公布 origin 才是键、写回只改匹配项且不回落。保留设备码优先和密钥不进 Skill 的句子。reference 不写这份配置。

## 2. 验收

- [x] 2.1 更新 `tests/acceptance/skills.test.ts`，锁定新的顺序和写回句子，并确认入口仍不出现 `http://` 或 `https://`。
- [x] 2.2 运行 `pnpm exec vitest run tests/acceptance/skills.test.ts`。未通过前不把本文件的对应项标成完成。
