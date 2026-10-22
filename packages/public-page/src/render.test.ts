import { describe, expect, it } from "vitest";
import { markdownBody, renderOriginalPage } from "./render.ts";
import type { DisplayPage } from "./render.ts";
import type { PublicPage } from "@oneself/public-client";

function page(overrides: Partial<PublicPage> & Pick<PublicPage, "type" | "title">): PublicPage {
  return {
    source: "life",
    slug: overrides.slug ?? overrides.type,
    type: overrides.type,
    title: overrides.title,
    visibility: "public",
    frontmatter: overrides.frontmatter ?? {},
    markdown: overrides.markdown ?? "正文",
    hash: "hash",
  };
}

function display(entry: PublicPage, files: DisplayPage["files"] = []): DisplayPage {
  return { page: entry, files };
}

describe("renderOriginalPage", () => {
  it("shows only an empty state when there are no public pages", () => {
    const html = renderOriginalPage([]);
    expect(html).toContain('data-state="empty"');
    expect(html).toContain("还没有公开页");
    expect(html).toContain("visibility: public");
    expect(html).toContain('href="/admin"');
    expect(html).not.toContain("<ol");
    expect(html).not.toContain("私有页");
    expect(html).not.toContain("<article");
    expect(html).not.toContain("/resume");
  });

  it("shows every public profile, experience, education, and other type", () => {
    const html = renderOriginalPage([
      display(
        page({
          type: "profile",
          slug: "me",
          title: "工程师",
          frontmatter: { name: "张三", title: "职位不是这个", tags: ["hidden-tag"] },
          markdown:
            "---\ntype: profile\n---\n\n# 标题不是这个\n\n做个人工具。\n\n## Facts\n- id: fact_01\n",
        }),
      ),
      display(
        page({
          source: "work",
          type: "profile",
          slug: "other",
          title: "作者",
          frontmatter: { name: "李四" },
          markdown: "另一个公开介绍",
        }),
      ),
      display(
        page({
          source: "work",
          type: "experience",
          slug: "acme",
          title: "后端工程师",
          frontmatter: { org: "某公司", start: "2020-01", end: "2024-06" },
          markdown: "做后端",
        }),
      ),
      display(
        page({
          source: "study",
          type: "education",
          slug: "school",
          title: "计算机",
          frontmatter: { org: "某大学" },
          markdown: "在读",
        }),
      ),
      display(
        page({
          source: "notes",
          type: "note",
          slug: "hello",
          title: "一篇笔记",
          frontmatter: { org: "不该出现在其他类型" },
          markdown: "笔记正文 [[life/me]]",
        }),
      ),
    ]);

    expect(html.match(/data-type="profile"/g)).toHaveLength(2);
    expect(html).toContain('data-field="name">张三');
    expect(html).toContain('data-field="name">李四');
    expect(html).toContain('data-field="title">工程师');
    expect(html).not.toContain("职位不是这个");
    expect(html).not.toContain("hidden-tag");
    expect(html).toContain("做个人工具。");
    expect(html).toContain("## Facts");
    expect(html).toContain("fact_01");
    expect(html).not.toContain("type: profile");

    expect(html).toContain('data-type="experience"');
    expect(html).toContain('data-field="title">后端工程师');
    expect(html).toContain('data-field="org">某公司');
    expect(html).toContain('data-field="start">2020-01');
    expect(html).toContain('data-field="end">2024-06');
    expect(html).toContain("做后端");

    expect(html).toContain('data-type="education"');
    expect(html).toContain('data-field="org">某大学');
    expect(html).not.toContain(
      'data-type="education" data-source="study" data-slug="school"><h2 data-field="title">计算机</h2><p data-field="start"',
    );

    const education = html.slice(
      html.indexOf('data-type="education"'),
      html.indexOf('data-type="note"'),
    );
    expect(education).not.toContain('data-field="start"');
    expect(education).not.toContain('data-field="end"');
    expect(education).not.toContain('data-field="type"');

    expect(html).toContain('data-type="note"');
    expect(html).toContain('data-field="type">note');
    expect(html).toContain("笔记正文 [[life/me]]");
    expect(html).not.toContain("不该出现在其他类型");
    expect(html).not.toContain("/resume");
  });

  it("escapes body text instead of rendering it as HTML", () => {
    const html = renderOriginalPage([
      display(
        page({
          type: "note",
          title: '<img alt="x">',
          markdown: "<script>alert(1)</script>",
        }),
      ),
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img alt=&quot;x&quot;&gt;");
  });

  it("shows public images and PDFs and skips other media types", () => {
    const html = renderOriginalPage([
      display(
        page({ type: "profile", title: "工程师", frontmatter: { name: "张三" }, markdown: "介绍" }),
        [
          { id: "pic", mediaType: "image/png", href: "blob:pic" },
          { id: "doc", mediaType: "application/pdf", href: "blob:doc" },
          { id: "bin", mediaType: "application/octet-stream", href: "blob:bin" },
        ],
      ),
    ]);
    expect(html).toContain('data-file="pic"');
    expect(html).toContain('src="blob:pic"');
    expect(html).toContain('data-media-type="application/pdf"');
    expect(html).toContain('href="blob:doc"');
    expect(html).not.toContain("blob:bin");
    expect(html).not.toContain("/pcp/v1/files");
  });

  it("keeps the markdown body when there is no frontmatter block", () => {
    expect(markdownBody("只有正文")).toBe("只有正文");
  });
});
