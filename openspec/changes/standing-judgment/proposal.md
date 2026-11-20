# Proposal

## Why

Agent 不能靠搜索档案理解一个人。需要两页固定判断：`self/soul` 记录长期内在特征，`self/recent` 记录最近仍有效的生活状态。上传资料本身不是写入理由。

## What Changes

- 保证目录 `self`，以及 `self/soul`、`self/recent`。已有正文不覆盖。`self/profile` 与 `self/now` 不再是这两页。
- 种子就是 Skill 里的空模板。栏目标题中英对照。`self/soul` 上半是六个正式维度，下半是候选观察，不另建观察页。`self/recent` 只保留仍有效的近期信息，按条失效，不按月归档，也不设候选区。
- **BREAKING**：不能删除 `self`，也不能删除 `self/soul` 和 `self/recent`。对这两页调用会重写 `## Facts` 或 `## Timeline` 的结构操作返回 `invalid`。
- 发现文档公布 `self.soul` 与 `self.recent`。产品 Skill 仍只有 `oneself`。`references/self.md` 放入两份模板、候选字段、三档晋升和四步整理。不要求置信度评分或状态机。
- 批准受限密钥或设备时，界面默认勾上 `self` 的读。所属人可以去掉。

## Capabilities

### New Capabilities

- `standing-judgment`: 灵魂画像与近期画像的固定地址、模板和保护。

### Modified Capabilities

- `pages`: 不可删除的是 `self/soul` 与 `self/recent`，不是 `profile` 与 `now`。
- `protocol`: 发现文档改公布这两个地址。
- `skill-discovery`: 参考必须包含两份模板和判断格式。
- `access`: 受限批准界面默认勾上 `self` 的读，所属人可以取消。

## Impact

- 替换本变更里已经按 `profile` / `now` 落地的种子、发现文档和 Skill 正文。那些实现与本版合同不符，任务重新打开。
- 不新增操作、表或围栏。不改 `docs/PRD.md`，直到归档。
