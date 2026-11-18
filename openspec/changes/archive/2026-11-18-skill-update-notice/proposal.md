# Proposal

## Why

站点升级不会改写已安装的产品 Skill。旧副本仍按旧句子写 `config.json`。所属人升级后需要在管理端看到明确提示，并复制升级命令自己执行。服务端不能替已安装的副本更新。

## What Changes

- 已接入 Agent 时，管理端读取 `/.well-known/agent-skills/index.json` 里 `oneself` 的 `digest`。与本机上次确认的摘要不同，或还没有确认过时，Skill 菜单显示红点。星图不放这条升级提示。
- Skill 页始终给出两条可复制命令：全新安装 `npx skills add <origin> -a <agent> -s oneself -y`，已安装升级 `npx skills update oneself`。提示生效时才显示标题「发现 oneself skill 有更新，请升级 skill」和「已更新」按钮，并对比上一份已确认正文。
- 所属人确认已更新后记住当前摘要和正文，相同摘要不再点亮红点。还没有 Agent 时不点亮红点，星图仍只保留现有安装命令，并静默记下当前摘要。静默记下摘要时如果读到了当前正文，一并记下，供之后对比；没有读到正文就不覆盖已有正文。读不到正文或写不进本地存储，都不挡住星图。
- 直接打开或刷新 `/admin/skill` 返回管理端文档。
- 不改配置文件，不由服务端执行升级命令。

## Capabilities

### New Capabilities

- `skill-update-notice`：管理端在产品 Skill 摘要变化时，用 Skill 菜单红点和 Skill 页提示所属人复制升级命令。

### Modified Capabilities

- 无。

## Impact

- `apps/admin` 的 Skill 菜单、Skill 页、发现索引解析和对应测试。星图不承担升级提示。
- `apps/server` 的管理端静态回退要认得 `skill` 页面。
- 不改 PCP、安装索引形状或产品 Skill 正文。
