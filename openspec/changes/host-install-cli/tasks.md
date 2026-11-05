## 1. Release 与入口

- [x] 1.1 工作流使用 `oven-sh/setup-bun@v2`，先编二进制与上传资产，再 push 镜像
- [x] 1.2 公开 `oneself.sh` / `oneself.ps1` 为钉版本 bootstrap；compose 包只含 `compose.yaml`、`.env.example`、`deploy/Caddyfile`
- [x] 1.8 删除完整 `deploy/oneself.sh` / `deploy/oneself.ps1` 与 `ONESELF_USE_CLI` 交接；Release 说明不再提 shell 安装器
- [x] 1.3 SHA256SUMS 使用扁平文件名；bootstrap 下载后校验（先下到临时文件，校验通过才替换缓存）
- [x] 1.4 bootstrap 只钉自己的标签（`ONESELF_BOOTSTRAP_REF` / `$BootstrapRef`），导出为 `ONESELF_BUNDLED_REF`；`ONESELF_REF` 仅在用户事先显式设置时传下去；非法 ref 下载前拒绝
- [x] 1.5 Unix：stdin 不是终端时复制已打开的 stdout/stderr，不新开 `/dev/tty`（否则 macOS 上方向键无效）
- [x] 1.6 Windows：`irm | iex` 下不 `exit`，失败 `throw`；`Start-Process -NoNewWindow` 接控制台；变量与环境变量不泄漏到调用者会话
- [ ] 1.7 在真实 Windows（PowerShell 5.1 与 7）交互式窗口里手测 `irm | iex` 安装、提问与失败路径（目前只在 Linux pwsh 7 上用桩验证了 iex 行为与退出码）

## 2. CLI 契约

- [x] 2.1 校验 compose 包、写 `.oneself-release`、钉 `ONESELF_IMAGE`
- [x] 2.2 停其它入口、`--yes`、非 TTY 拒绝（bootstrap 提供终端）
- [x] 2.3 安装后 `bin/oneself` + 薄 launcher（`src/launchers.ts`，只转调二进制，`launchers.test.ts`）；install / update 删除旧版留下的 `deploy/oneself.*`；update/doctor/backup/restore 子命令
- [x] 2.10 自身二进制复制走临时文件 + rename，跳过复制到自己（`bin/oneself update` 不截断运行中的文件）
- [x] 2.4 `originOk` / `chmod 600` / doctor Windows 权限；`validate.test.ts`
- [x] 2.5 防降级：`install` / `update` 共用 `maybeSyncBundle`（`src/sync.ts`），只认用户显式 `ONESELF_REF` 为强制；`ref.test.ts`、`sync.test.ts`
- [x] 2.6 `refNewer`：预发布早于同号正式版（`ref.test.ts`）
- [x] 2.7 `--yes` 下环境变量同样过校验（`PUBLIC_ORIGIN`、`APP_DOMAIN`）；`install.test.ts`
- [x] 2.8 完成提示按平台给出 update 命令（Windows 不再写 `oneself.sh`）
- [x] 2.9 直接运行 `bin/oneself update`（没有 `ONESELF_REF` 也没有 `ONESELF_BUNDLED_REF`）走 `planUpdateSync`：解析 GitHub 最新正式版，比已装版本新才同步安装文件并改钉 `ONESELF_IMAGE`；解析结果相同或更旧则不降级，只刷新已钉镜像；查询失败在 `docker compose pull` 之前停下。更旧的 `ONESELF_BUNDLED_REF` 不得降级；用户显式 `ONESELF_REF` 仍可强制（含降级）。`install` 调用 `maybeSyncBundle` 时不跟 latest

## 3. musl 与文档

- [x] 3.1 构建脚本尝试 musl 目标；bootstrap 检测 Alpine/musl，缺资产时失败并提示等带 musl 的 Release（无 shell 回退）
- [x] 3.2 README / ARCHITECTURE（含目录树 `apps/cli`、`deploy/oneself-bootstrap.*`）/ 本 OpenSpec 写明 CLI 唯一实现、公开入口、防降级与 musl 无回退
- [ ] 3.3 本 change 尚未归档到 `openspec/specs/`；合并并在真实 Release 上验收后再归档

## 4. 已知窗口（选定的取舍，不是缺陷）

- 资产上传与镜像 push 之间，新标签已可安装但 `docker compose pull` 可能暂时失败；重跑 job 可补镜像。
