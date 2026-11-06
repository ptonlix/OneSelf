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
      level: 3,
      inlines: [{ kind: "text", text: "在职" }],
    });
    expect(blocks[1]).toMatchObject({ kind: "paragraph" });
    expect(blocks[2]).toMatchObject({
      kind: "list",
      items: [
        [{ kind: "text", text: "网关项目" }],
        [
          { kind: "text", text: "见 " },
          { kind: "link", key: "profile/chen-fudong", label: "陈福东" },
        ],
      ],
    });
  });
});
