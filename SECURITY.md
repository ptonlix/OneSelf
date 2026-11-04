# 安全 / Security

OneSelf 保存的是一个人的上下文。公开 Issue、Pull Request 和 Discussions 都不是交密钥的地方。

OneSelf stores one person's context. Public issues, pull requests, and discussions are not a place to hand over secrets.

## 报告漏洞 / Report a vulnerability

请用 GitHub 的私人安全通告，不要开公开 Issue：

Use a private GitHub security advisory. Do not open a public issue.

<https://github.com/ptonlix/OneSelf/security/advisories/new>

仓库没有公开的安全联系邮箱。如果这个入口不可用，用 GitHub 私下联系仓库所有者，仍然不要把密钥或别人的个人上下文贴到公开页面。

This repository does not publish a security email. If that page is unavailable, contact the repository owner privately on GitHub. Still do not post keys or someone else's personal context on a public page.

## 报告里不要包含 / Leave these out

- 所属人密码，以及 `OWNER_PASSWORD`、`OWNER_RESET_PASSWORD`
- API Key 原文（`osk_` 开头的那一串）
- OAuth 刷新令牌、访问令牌、设备码
- 对象存储密钥、带口令的 `DATABASE_URL`、`TUNNEL_TOKEN`、`TAILSCALE_AUTHKEY`
- `pnpm data:export` 产生的导出包（里面有口令哈希和密钥哈希）
- 从真实实例复制出来的私有页、原件或管理端截图

能复现时，写版本（镜像标签或 git 修订）、入口 profile（`local`、`cloudflared`、`caddy`、`tailscale`），以及响应里的 `error` 码。跟踪信息请打码。

If you can, include the version (image tag or git revision), the ingress profile (`local`, `cloudflared`, `caddy`, or `tailscale`), and the `error` code from the response. Redact traces.

## 范围 / Scope

在范围内：这个仓库里的应用、安装 CLI、发现文档和产品 Skill 中，会导致未授权读取、未授权写入、绕过批准或把秘密写进公开页面的问题。

In scope: a problem in this repository's application, install CLI, discovery documents, or product skill that lets someone read or write without authorization, skip an approval, or place a secret on a public page.

不在范围内：部署者自己把默认的 `local` 入口暴露到不受信任的网络。这个入口是明文 HTTP，只准备给本机和局域网。公网应改用文档里的 `cloudflared`、`caddy` 或 `tailscale`。也请不要指望协议约束对方拿到字节之后是否用于训练或转发。文档写明协议只控制发出去的字节。

Out of scope: an operator publishing the default `local` ingress onto a network they do not trust. That ingress is plain HTTP and is meant for the host and the LAN. For the public internet, use `cloudflared`, `caddy`, or `tailscale` as the docs describe. The protocol also does not control what a recipient does with bytes after they have been sent. The docs state that it only controls the bytes that leave.

自托管实例的补丁由运行的人拉取新版本或新镜像完成。请不要在公开报告里写利用步骤。

The person who runs a self-hosted instance applies a fix by taking a newer version or image. Do not include exploit steps in a public report.
