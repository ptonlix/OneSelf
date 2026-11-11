import { describe, expect, it } from "vitest";

import { pageBody, proseBlocks } from "./nebula-prose";

const page = `---
type: experience
title: 深信服
visibility: public
---
## 在职

2018 年到 2024 年，做研发和产品。

- 网关项目
- 见 [[profile/chen-fudong|陈福东]]
`;

describe("page prose", () => {
  it("drops frontmatter and keeps the dates and projects", () => {
    expect(pageBody(page)).not.toContain("visibility:");
    const blocks = proseBlocks(page);
    expect(blocks[0]).toEqual({
      kind: "heading",
      level: 2,
      inlines: [{ kind: "text", text: "在职" }],
    });
    expect(blocks[1]).toMatchObject({ kind: "paragraph" });
    expect(blocks[2]).toMatchObject({
      kind: "list",
      ordered: false,
      items: [
        { inlines: [{ kind: "text", text: "网关项目" }], nested: [] },
        {
          inlines: [
            { kind: "text", text: "见 " },
            { kind: "link", key: "profile/chen-fudong", label: "陈福东" },
          ],
          nested: [],
        },
      ],
    });
  });

  it("previews quotes, tables and marks instead of leaving the source marks", () => {
    const blocks = proseBlocks(`---
title: 日记
---
> 一句话：先补控制面。
力气放回控制面。

| 项目 | 结果 |
| --- | ---: |
| OneSelf | 已发布 |

1. 收回身份层
2. 补 [控制面](https://example.com/control)

~~旧方向~~ 和 *新方向*
`);
    expect(blocks[0]).toMatchObject({
      kind: "quote",
      blocks: [
        {
          kind: "paragraph",
          inlines: [{ kind: "text", text: "一句话：先补控制面。" }],
        },
      ],
    });
    expect(blocks[1]).toMatchObject({
      kind: "paragraph",
      inlines: [{ kind: "text", text: "力气放回控制面。" }],
    });
    expect(blocks[2]).toEqual({
      kind: "table",
      headers: [[{ kind: "text", text: "项目" }], [{ kind: "text", text: "结果" }]],
      aligns: ["left", "right"],
      rows: [[[{ kind: "text", text: "OneSelf" }], [{ kind: "text", text: "已发布" }]]],
    });
    expect(blocks[3]).toMatchObject({
      kind: "list",
      ordered: true,
      items: [
        { inlines: [{ kind: "text", text: "收回身份层" }], nested: [] },
        {
          inlines: [
            { kind: "text", text: "补 " },
            { kind: "url", href: "https://example.com/control", label: "控制面" },
          ],
          nested: [],
        },
      ],
    });
    expect(blocks[4]).toMatchObject({
      kind: "paragraph",
      inlines: [
        { kind: "del", text: "旧方向" },
        { kind: "text", text: " 和 " },
        { kind: "em", text: "新方向" },
      ],
    });
  });

  it("keeps a following line out of the quote unless that line has a marker", () => {
    const blocks = proseBlocks(`> 第一行

>text
>= 不是引用
`);
    expect(blocks[0]).toEqual({
      kind: "quote",
      blocks: [{ kind: "paragraph", inlines: [{ kind: "text", text: "第一行" }] }],
    });
    expect(blocks[1]).toEqual({
      kind: "quote",
      blocks: [{ kind: "paragraph", inlines: [{ kind: "text", text: "text" }] }],
    });
    expect(blocks[2]).toEqual({
      kind: "paragraph",
      inlines: [{ kind: "text", text: ">= 不是引用" }],
    });
  });

  it("accepts an http image and a spaced quote marker", () => {
    expect(proseBlocks("![图](HTTP://example.com/a.png)")[0]).toEqual({
      kind: "paragraph",
      inlines: [{ kind: "image", src: "HTTP://example.com/a.png", alt: "图" }],
    });
    expect(proseBlocks("> text")[0]).toMatchObject({
      kind: "quote",
      blocks: [{ kind: "paragraph", inlines: [{ kind: "text", text: "text" }] }],
    });
  });

  it("renders safe images and keeps an indented list nested", () => {
    const blocks = proseBlocks(`见 ![封面](https://example.com/a.png) 完

![](/media/a.png)

![跳过](javascript:alert(1))

![外链](//cdn.example/a.png)

![数据](data:image/png;base64,aaaa)

![信](mailto:a@b.c)

[信](mailto:a@b.c)

- parent
  - child
    - grandchild
`);
    expect(blocks[0]).toEqual({
      kind: "paragraph",
      inlines: [
        { kind: "text", text: "见 " },
        { kind: "image", src: "https://example.com/a.png", alt: "封面" },
        { kind: "text", text: " 完" },
      ],
    });
    expect(blocks[1]).toEqual({
      kind: "paragraph",
      inlines: [{ kind: "image", src: "/media/a.png", alt: "" }],
    });
    expect(blocks[2]).toEqual({
      kind: "paragraph",
      inlines: [{ kind: "text", text: "跳过" }],
    });
    expect(blocks[3]).toEqual({
      kind: "paragraph",
      inlines: [{ kind: "text", text: "外链" }],
    });
    expect(blocks[4]).toEqual({
      kind: "paragraph",
      inlines: [{ kind: "text", text: "数据" }],
    });
    expect(blocks[5]).toEqual({
      kind: "paragraph",
      inlines: [{ kind: "text", text: "信" }],
    });
    expect(blocks[6]).toEqual({
      kind: "paragraph",
      inlines: [{ kind: "url", href: "mailto:a@b.c", label: "信" }],
    });
    expect(blocks[7]).toEqual({
      kind: "list",
      ordered: false,
      items: [
        {
          inlines: [{ kind: "text", text: "parent" }],
          nested: [
            {
              kind: "list",
              ordered: false,
              items: [
                {
                  inlines: [{ kind: "text", text: "child" }],
                  nested: [
                    {
                      kind: "list",
                      ordered: false,
                      items: [{ inlines: [{ kind: "text", text: "grandchild" }], nested: [] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
