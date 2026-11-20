# Tasks

## 1. 领域合同

- [x] 1.1 把保留页改成 `self/soul` 和 `self/recent`。种子使用中英标题空模板，不带样例判断；写入只要求 soul 的 `type` 与 `name`、recent 的 `type` 与 `as_of`。用领域单测验证模板写入不产生 Facts 投影，错误 `type` 不覆盖。
- [x] 1.2 `delete_page` 拒绝这两页，`sources_delete` 拒绝 `self`，`remember`、`forget`、`add_timeline_entry` 在这两页返回 `invalid`。用领域单测验证原文不变，其它页仍可删除。

## 2. 启动保证

- [x] 2.1 启动时保证未软删除的 `self` 和两页新地址。不覆盖已有对象，不恢复软删除的 `self`，不把 `self/profile` 当成画像。用进程内测试验证空库读到两页模板，已有 soul 哈希不变。

## 3. 发现文档

- [x] 3.1 发现文档改为 `self.soul` 与 `self.recent`，版本保持 `1`。用协议冒烟验证匿名读取和错误 `Host` 不改写这两个值。

## 4. 产品 Skill

- [x] 4.1 重写 `references/self.md`。Soul 模板含六节、认知演化和 `Observations — 候选观察`。候选块含 `observation_id`、`statement`、`source`、`evidence`、`first_seen`、`last_seen`、`note`，`source` 只能是用户自述、行为观察、Agent 推断。一次偶然不自动进入候选。写明三档晋升、四步整理、候选不能当已确认特征、Recent 无候选区且过期即退出。用验收测试核对这些标题和句子。
- [x] 4.2 入口改为先读这份参考，再读 `self/soul` 和 `self/recent`。打包和引用路由仍返回同一份。用 Skill 字节测试验证。

## 4.3 认知层

- [x] 4.3 增加 `references/philosophy.md` 与 `references/cognition.md`，入口指向这两份。档案和引用路由一并提供。不新增产品 Skill，不改 Soul 与 Recent 的字段。
- [x] 4.4 写明用户意图优先、候选不是收集箱、正式判断的来源与范围、Recent 只在判断区存一条。不把画像判断改成系统 Facts，不加 confidence。

## 5. 批准界面

- [x] 5.1 确认 `self` 仍只默认勾选读。若实现未改这一行为，用现有 `forms.test.ts` 复核后勾选本任务。

## 6. 入口冒烟

- [x] 6.1 冒烟验证所属人能读到 soul 与 recent，删除和 `add_timeline_entry` 为 `invalid`，不能读 `self` 的密钥得到 `not_found`，全部数据权限的 `whoami` 列出 `self`。

## Workflow follow-up

- 归档时再改 `docs/PRD.md`。未归档前不要改。
- 归档后核对主 spec 已吸收这些 delta。
