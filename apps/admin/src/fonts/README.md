# 字体

- `Geist-Variable.woff2`、`GeistMono-Variable.woff2`：Geist 与 Geist Mono 可变字体（字重 100–900）。
- 来源：Vercel 官方 Geist 字体仓库 <https://github.com/vercel/geist-font> 发布到 npm 的 `geist` 包 1.8.2，取自 `dist/fonts/geist-sans/Geist-Variable.woff2` 和 `dist/fonts/geist-mono/GeistMono-Variable.woff2`，未修改。
- 许可证：SIL Open Font License 1.1，全文见同目录 `OFL.txt`（即该包的 `LICENSE.txt`）。

`apps/admin/src/fonts/` 与 `packages/public-page/src/fonts/` 是同一份文件，`apps/admin/src/brand.test.ts` 断言两边字节相同。字体随包打进构建产物，页面不请求任何外部字体地址。
