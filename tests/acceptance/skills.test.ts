import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readSkill(name: string): string {
  return readFileSync(resolve(root, "skills", "oneself", name), "utf8");
}

const requiredSentences = [
  "frontmatter",
  "两种 fence",
  "files",
  "[[source/slug]]",
  "内置页只是介绍",
  "真实路径",
  "保留路径",
  "credentials: omit",
  "不得写入密钥或私有页",
  "批准地址必须交给所属人",
  "同意前不得声称已更换",
  "下一轮必须从原始源码 zip 开始",
] as const;

const entryConfigSentences = [
  "$XDG_CONFIG_HOME/oneself/config.json",
  "~/.config/oneself/config.json",
  "%APPDATA%\\oneself\\config.json",
  "ONESELF_ORIGIN",
  "metadata.oneself_origin",
  "ONESELF_API_KEY",
  "不要写所属人密码",
  "不要只存 15 分钟的 access token",
  "也不要存批准地址或设备码",
  "不得把 API Key 或所属人密码写入 Skill 文件、页面或公开站点",
  "以本 origin 的字节为准",
] as const;

describe("product skills", () => {
  const entry = readSkill("SKILL.md");
  const context = readSkill("references/context.md");
  const publicPage = readSkill("references/public-page.md");
  const combined = `${context}\n${publicPage}`;

  it("keeps context rules in references/context.md", () => {
    for (const sentence of [
      "frontmatter",
      "visibility",
      "两种 fence",
      "## Facts",
      "## Timeline",
      "files",
      "[[source/slug]]",
      "credentials: omit",
      "不得写入密钥或私有页",
      "带全部数据权限的 API Key / 设备码授权",
    ]) {
      expect(context, sentence).toContain(sentence);
    }
  });

  it("keeps site rules in references/public-page.md", () => {
    for (const sentence of [
      "## 内置页只是介绍",
      "## 读取公开资料",
      "`public.endpoints`",
      "`uploads.put_site`",
      "get_site",
      "put_site",
      "preview_site",
      "activate_site",
      "不规定任何视觉规范",
      "@oneself/public-client",
      "packages/public-client/src/client.ts",
      "必须在构建时把它打进产物",
      "资源一律用相对路径",
      'base: "./"',
      "真实路径",
      "blog/index.html",
      "保留路径",
      "pcp",
      "oauth",
      ".well-known",
      "admin",
      "skills",
      "media",
      "_preview",
      "credentials: omit",
      "不得写入密钥或私有页",
      "批准地址必须交给所属人",
      "同意前不得声称已更换",
      "下一轮必须从原始源码 zip 开始",
      "public-page-source.zip",
    ]) {
      expect(publicPage, sentence).toContain(sentence);
    }
    for (const forbidden of [
      "brand.css",
      "--teal",
      "--orbit",
      "data-field",
      "data-type",
      "npm install @oneself/public-client",
      "esm.sh",
      "unpkg",
      "jsdelivr",
      "原始页面能展示的公开字段",
    ]) {
      expect(publicPage, forbidden).not.toContain(forbidden);
    }
  });

  it("contains every required sentence in the references, not the entry", () => {
    for (const sentence of requiredSentences) {
      expect(combined, sentence).toContain(sentence);
    }
    expect(entry).not.toContain("## Facts");
    expect(entry).not.toContain("public-page-source.zip");
    expect(entry).not.toContain("http://");
    expect(entry).not.toContain("https://");
  });

  it("keeps connection config in the entry only", () => {
    for (const sentence of entryConfigSentences) {
      expect(entry, sentence).toContain(sentence);
      expect(context, sentence).not.toContain(sentence);
      expect(publicPage, sentence).not.toContain(sentence);
    }
    expect(entry).toContain("写、改、删或挂接文件之前，必须先读 `references/context.md`");
    expect(entry).toContain(
      "定制、上传、预览或申请上线公开页之前，必须先读 `references/public-page.md`",
    );
    expect(entry).toContain("{oneself_origin}/skills/oneself/references/context.md");
    expect(entry).toContain("{oneself_origin}/skills/oneself/references/public-page.md");
    expect(entry).toContain("{oneself_origin}/skills/oneself/references/self.md");
    expect(entry).toContain("`references/philosophy.md`");
    expect(entry).toContain("`references/cognition.md`");
    expect(entry).toContain("用更少、更准确的判断");
    expect(entry).toContain("手里有文件，不等于可以写入个人上下文");
    expect(entry).toContain("每次处理新的个人上下文");
    expect(entry).toContain("不限于修改画像");
    expect(entry).not.toContain("只有这次任务是保存、记住或更新画像时，才读");
    expect(entry).toContain("`self/soul`");
    expect(entry).toContain("`self/recent`");
  });

  it("states the mission and the thinking checkpoints", () => {
    const philosophy = readSkill("references/philosophy.md");
    const cognition = readSkill("references/cognition.md");
    expect(philosophy).toContain("不是记录员");
    expect(philosophy).toContain("不要写入个人上下文");
    expect(philosophy).toContain("一个准确的空白");
    expect(philosophy).toContain("用更少、更准确的判断");
    expect(cognition).toContain("检查点");
    expect(cognition).toContain("本人说出的话");
    expect(cognition).toContain("一次出现不是规律");
    expect(cognition).not.toContain("Hono");
  });

  it("gives the agent the soul and recent templates", () => {
    const self = readSkill("references/self.md");
    for (const heading of [
      "01. Values — 价值观与信念",
      "06. Strengths & Frictions — 优势与摩擦",
      "Observations — 候选观察",
      "01. Focus — 近期关注",
      "07. Goals & Challenges — 目标与困扰",
    ]) {
      expect(self, heading).toContain(heading);
    }
    expect(self).toContain("observation_id");
    expect(self).toContain("last_seen");
    expect(self).toContain("一次偶然");
    expect(self).toContain("也不自动进入候选");
    expect(self).toContain("不能因此写成已被行为验证的事实");
    expect(self).toContain("来源只使用用户自述");
    expect(self).toContain("都必须有 `valid_until`");
    expect(self).toContain("日期 | 变化 | 补充");
    expect(self).toContain("不算新观察");
    expect(self).toContain("source: 行为观察");
    expect(self).toContain("goals_challenges");
    expect(self).toContain("不是系统的 `## Facts` 或 `## Timeline` 围栏");
    expect(entry).toContain("`0600`");
    expect(self).toContain("不能当作已经确认的特征");
    expect(self).toContain("不要创建 `self/observations`");
    expect(self).toContain("valid_until");
    expect(self).toContain("不按自然月归档");
    expect(self).toContain("上传一份资料，本身不是写入这两页的理由");
    expect(self).toContain("服务启动时");
    expect(self).toContain("不要再创建这两页");
    expect(entry).toContain("这两页由系统在启动时按模板生成");
    expect(self).toContain("不是收集箱");
    expect(self).toContain("来源：行为观察");
    expect(self).toContain("不是系统围栏");
    expect(self).toContain("不要在栏目下再抄一遍");
    expect(self).toContain("`remember`");
    expect(self).toContain("不得写入密钥或私有页");
    expect(self).toContain("credentials: omit");
    expect(self).not.toContain("Hono");
    expect(self).not.toContain("context-management");
  });

  it("takes origin in one order and asks only when all four are missing", () => {
    const rule =
      "调用前按这个顺序取 origin：先是用户这次要求连接、上传或操作的那一台 origin，然后 `ONESELF_ORIGIN`，然后文件里的 `current`，再 `metadata.oneself_origin`。四者都没有才问一次，并把答案写成 `current`，同时写入对应 profile。";
    expect(entry).toContain(rule);
    expect(entry.match(/调用前按这个顺序取 origin/g)).toEqual(["调用前按这个顺序取 origin"]);
    expect(entry).toContain("`metadata.oneself_origin` 标出这一台实例");
    expect(entry).toContain("已有其中任一来源时不要再问");
    expect(entry).toContain("这个文件保存 `current` 和 `profiles`");
    expect(entry).toContain("`profiles` 的键是 origin");
    expect(entry).toContain("不改 `current`");
    expect(entry).toContain("不得用另一台的 refresh token 或 API Key");
    expect(entry).toContain("禁止改回只有顶层 `origin` 的旧形状");
    expect(entry).toContain("一次指定两台 origin 时停下来问");
    expect(entry).toContain("写入前必须先读到整个文件");
    expect(entry).toContain("不要回落");
    expect(entry).toContain("（`metadata.oneself_origin` 标出这一份副本）");
    expect(entry).not.toContain("随站点下发的副本里就是");
    expect(entry).not.toContain("就是 `metadata.oneself_origin`");
    for (const sentence of [
      "每次写入前必须先读到整个文件",
      "只更新 origin 完全相同的 profile",
      "这包括换上 API Key，不限于设备码换到 refresh token",
      "其他 origin 必须还在",
      "不得丢掉已有凭据",
      "`ONESELF_API_KEY` 只覆盖这次选中的 origin，不写入文件",
      "`ONESELF_API_KEY` 不写入文件",
    ]) {
      expect(entry, sentence).toContain(sentence);
      expect(context, sentence).not.toContain(sentence);
      expect(publicPage, sentence).not.toContain(sentence);
    }
    expect(entry).not.toContain("设备码换到 refresh token 后，只写入");
    expect(entry).not.toContain("三者都没有才问一次");
    expect(entry).not.toContain("保存 `origin`，以及 `api_key`");
    expect(entry).not.toContain("有 `metadata.oneself_origin` 时，调用这一台实例");
    expect(entry).not.toContain("有 metadata.oneself_origin 时就调用它");
    expect(entry).not.toContain("没有 `oneself_origin` 的副本");
    expect(entry).not.toContain("没有 oneself_origin 的副本");
    expect(entry).not.toContain("否则问用户一次");
    expect(entry).not.toContain("否则问一次");
    const originRule = entry.slice(entry.indexOf(rule));
    expect(originRule.indexOf("用户这次要求连接")).toBeLessThan(
      originRule.indexOf("ONESELF_ORIGIN"),
    );
    expect(originRule.indexOf("ONESELF_ORIGIN")).toBeLessThan(originRule.indexOf("`current`"));
    expect(originRule.indexOf("`current`")).toBeLessThan(
      originRule.indexOf("metadata.oneself_origin"),
    );
  });

  it("sends the agent to the discovery document for interface details", () => {
    expect(entry).toContain("## 先读发现文档");
    expect(entry).toContain("`GET {origin}/.well-known/pcp`");
    expect(entry).toContain("`metadata.oneself_origin`");
    expect(entry.indexOf("## 先读发现文档")).toBeLessThan(entry.indexOf("## 动手前"));
    for (const field of ["`operations`", "`auth`", "`public`", "`uploads`", "`openapi`", "`mcp`"]) {
      expect(entry, field).toContain(field);
    }
    for (const reference of [context, publicPage]) {
      expect(reference).toContain("发现文档 `/.well-known/pcp` 为准");
    }
    expect(context).toContain("`uploads.file_upload`");
  });

  it("keeps the owner approval workflows in the Skill", () => {
    expect(entry).toContain("## 连接并由所属人批准");
    expect(entry).toContain("`verification_uri_complete`");
    expect(entry).toContain("申请设备码，不要先请所属人创建 API Key");
    expect(entry).toContain("`user_code`");
    expect(entry.indexOf("申请设备码")).toBeLessThan(entry.indexOf("API Key 是另一种选择"));
    expect(entry).toContain("脚本或 CI");
    expect(entry).not.toContain("{origin}/admin/api-keys/new");
    expect(entry).not.toMatch(/https?:\/\//);
    expect(entry).toContain("Agent 不能自己创建或作废密钥");
    expect(entry).toContain("请求头按发现文档 `auth` 写");
    expect(publicPage).toContain("Agent 不能调用 `POST /admin/site-activations/{id}/approve`");
    expect(publicPage).toContain("## 批准");
  });

  it("does not hard-code what discovery and OpenAPI publish", () => {
    const all = `${entry}\n${combined}`;
    // Operation and public paths, credential headers, and upload limits come from the server.
    expect(all).not.toMatch(/\/pcp\/v1\//);
    for (const literal of [
      "Authorization:",
      "ApiKey <key>",
      "Bearer <",
      "X-Api-Key",
      "20 MiB",
      "200 个文件",
      "multipart 字段 `file`",
      "multipart 字段 `archive`",
      "data_base64",
      "archive_base64",
      "^[a-z][a-z0-9-]{0,62}$",
      "^[a-z0-9][a-z0-9-]{0,79}$",
    ]) {
      expect(all, literal).not.toContain(literal);
    }
  });

  it("does not name Hono, Express, or Next.js", () => {
    for (const name of ["Hono", "Express", "Next.js"]) {
      expect(`${entry}\n${combined}`, name).not.toContain(name);
    }
  });
});
