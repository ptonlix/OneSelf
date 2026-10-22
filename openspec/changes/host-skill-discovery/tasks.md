# Tasks

## 1. 收成一个 oneself

- [ ] 1.1 建立 `skills/oneself/SKILL.md`、`references/context.md`、`references/public-page.md`，删除平铺的 `context-management.md` 和 `public-page.md`。入口写明写页前读 `references/context.md`，改公开页前读 `references/public-page.md`；本地没有文件时用 `oneself_origin` 取 `/skills/oneself/references/` 下的对应文件。验收测试改为读这两份 reference，并仍断言既有必写句子存在、正文不出现服务端框架名。
- [ ] 1.2 连接配置只写在入口：`$XDG_CONFIG_HOME/oneself/config.json`，否则 `~/.config/oneself/config.json`，Windows 为 `%APPDATA%\oneself\config.json`。origin 顺序为 `ONESELF_ORIGIN`、该文件、`metadata.oneself_origin`。凭据只放该文件或 `ONESELF_API_KEY`。禁止写入所属人密码、单独的 access token、批准地址和设备码。与本 origin 的 Skill 字节冲突时服从本 origin。用验收测试断言这些句子出现在入口而不是两份旧 Skill 里。

## 2. 协议只登记 oneself

- [ ] 2.1 `list_skills` 和 `get_skill` 只接受 `oneself`。`context-management` 与 `public-page` 返回 `not_found`。`/.well-known/pcp` 的 `skills` 只含 `oneself`，指向 `{origin}/skills/oneself/SKILL.md`。用协议测试覆盖旧名字和新字段，并确认伪造 `Host` 不改写该 URL。
- [ ] 2.2 发出入口前写入 `metadata.oneself_origin`。`/skills/oneself/SKILL.md` 与 `/pcp/v1/skills/oneself` 字节相同，且不含密钥。reference 路由返回仓库中的两份文件，不插入 origin。用协议测试核对。
- [ ] 2.3 更新架构路径表和 README：产品 Skill 是 `oneself`，安装命令是 `npx skills add https://站点`。核对文档不再把两个平铺 `.md` 当作产品 Skill。

## 3. 安装索引和 archive

- [ ] 3.1 匿名提供 `GET /.well-known/agent-skills/index.json`，`Content-Type` 为 `application/json`，`Cache-Control` 为 `no-store`。`$schema` 为发现草案 0.2.0，只含 `oneself`，`type` 为 `archive`，`description` 同时覆盖写页和改公开页，`url` 使用 public origin。用协议测试核对条目和伪造 `Host`。
- [ ] 3.2 应用生成 `{origin}/skills/oneself.tar.gz`。根目录含插入 origin 后的 `SKILL.md` 以及两份 reference，不再套一层目录。archive 内的 `SKILL.md` 与入口响应字节相同。索引 `digest` 等于这次响应的 SHA-256。用协议测试下载并拆包核对，不手写固定哈希。
- [ ] 3.3 确认上传含 `.well-known/agent-skills/index.json` 的站点包仍被整包拒绝，且之后索引仍是应用生成的那份。用现有站点保留路径测试或补一条冒烟覆盖。

## 4. 验收

- [ ] 4.1 跑 Skill 验收测试和协议冒烟。确认旧的两个 Skill URL 和 `get_skill` 名字不可用，PCP 操作表、`original` 指针和 `original-page-source.zip` 未改。
