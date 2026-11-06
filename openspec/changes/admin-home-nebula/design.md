# Design

## Context

见 `proposal.md`。管理端是 Vite + React，只调 HTTP，现在只有 `react` 和 `react-dom`。首页在 `apps/admin/src/overview.ts`，和其他路由共用侧栏。目录删除、恢复和最近写入已经在 `/admin/records`，分别走 `sources_delete`、`sources_restore` 和 `query`。页删除已有 `DELETE /pcp/v1/pages/{source}/{slug}`，管理端还没调用。链接是页投影上的 `[[source/slug]]`，没有类型。`openspec/specs/` 没有已归档规格；未归档的概览卡片要求与本变更的首页冲突，实现时以本变更的 `/admin` 为准。

交互参照用过的原型已经删除，不进应用镜像。实现在 `apps/admin`。

## Goals / Non-Goals

**Goals:**

- 首页整屏星图的数据、转动和右侧抽屉能用现有删除接口落地。
- 星光连线与恒星用同一父级坐标，转动后两端仍重合。
- 被换掉的概览信息不消失。

**Non-Goals:**

- 不改资料列表、恢复和最近写入的行为。
- 不把星图做成 Agent 工具。
- 不在星图里改 Markdown 或做向量聚类。

## Decisions

1. **读模型只加所属人路由。** `GET /admin/graph` 与 `GET /admin/deleted-sources` 同类：所属人会话，不进 `packages/operations`。服务端从已有页投影组装目录、页和链接。软删除页、`hiddenBySource` 的页、已删除目录都不返回。目标不在活页集合里的链接带 `broken: true`，并带上目标的 `source/slug`。响应字段：`sources[{id, page_count}]`、`pages[{source, slug, type, title, visibility, updated_at, file_count, media_types}]`、`links[{from, to, broken}]`、`truncated`。不含正文。上限 2000 页、8000 条边，超出则 `truncated: true`，星图写明没画全。

2. **首页替换卡片，不替换侧栏。** `/admin` 仍用现有壳。侧栏第一项是星图，后面仍是资料、设备码、API Key、站点和密码。侧栏可以收起；收起后星图铺满视口，并留一个再展开的按钮。已批准设备列表现在只在概览里，挪到设备页，作废仍是现有的两步确认。无密钥且无已批准设备时，星图一角显示现有的 `npx skills add` 命令，不盖住可拖动区域。

3. **星图用 `three`，自己处理指针。** 只在 `apps/admin` 增加 `three@0.170.0`。不用 `examples/jsm` 的 TrackballControls：它在这页上会把脚本拖死，而且上下转有限位。所有恒星、星云和连线放在同一个 `Group` 里。连线点用该组的局部坐标，取恒星锚点的 `position`，不用世界坐标再写进子节点。按住主键在星图上拖动（页名也包括）就绕视角的上轴和右轴转这个组，并 `setPointerCapture`。移动超过约 5 像素算拖动，不打开右侧抽屉，并吃掉随后的 click。不足 5 像素才按射线或页名选中。两指滚动是没有 Ctrl 的 `wheel`，同样转动；Ctrl+滚轮或捏合才改距离。自转用时间差，角速度等于原先 OrbitControls `autoRotateSpeed: 0.28` 且不传 `deltaTime` 时的每帧角度乘以 60，大约每三分钟一圈。拖动、滚动或点选后 900 毫秒内不自转。减少动效时不自转。

4. **视觉只区分气和恒星。** 星云是少量半透明光斑，不铺假恒星。恒星才是亮点，旁挂页名。公开页实心，私有页空心，颜色用现有轨道色。连线是加法混合的点，不是 `Line`。断链用危险色，末端暗星标出路径。原件只出现在右侧抽屉的类型列表里。

5. **右侧抽屉复用现有删除，并展示去掉 frontmatter 的正文。** 点恒星或星云打开右侧抽屉，不是右下角小卡片。目录确认后 `DELETE /pcp/v1/sources/{id}`。页确认后 `DELETE /pcp/v1/pages/{source}/{slug}`。第一次点击只进入确认，与资料页的测试方式相同。成功后重新拉 `GET /admin/graph`。抽屉显示标题、路径、可见性、指出、指回、原件类型和正文。为读出正文会请求该页 Markdown，不提供编辑。

6. **读屏不靠 canvas。** 星图画布 `aria-hidden`。目录名标在对应云团上，页名标在对应恒星上，点击与点云团或恒星一样打开右侧抽屉。没有左侧页名列表。没有可用的 WebGL 时仍显示这些名字，不假装星图已画出。

## Risks / Trade-offs

- [未归档概览规格仍写着卡片] → 实现和测试以本变更的 `/admin` 为准，并改设备页上「到概览里作废」的句子。不在本变更里改那些未归档文件，除非测试直接断言旧概览。
- [`three` 增大管理端包] → 只打进 admin，不进服务端镜像逻辑。没有可用的 WebGL 时显示同一份页名列表，不假装星图已画出。
- [星图盖住批准入口] → 侧栏和设备页列表是明确任务，不能只留星图。收起侧栏只是临时铺满，必须能再展开。
- [自转在聚焦某个目录时把目标转出画面] → 已选中目录时绕视线轴转，使该团留在画面中心；未选中时绕世界上轴转。

## Migration Plan

先加路由和测试，再换首页。回滚是恢复 `overview.ts` 的首页并去掉 `three` 依赖；`GET /admin/graph` 可以留下，它不改变现有读接口。

## Open Questions

无。转速、拖动阈值和上限已在上面写死，不需要再问才能开工。
