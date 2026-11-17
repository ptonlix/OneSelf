import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SkillPage } from "./skill-view";

function press(node: ReactNode, label: string): void {
  if (!isValidElement(node)) return;
  const props = node.props as {
    children?: ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
  };
  if (
    props["aria-label"] === label ||
    (typeof props.children === "string" && props.children.includes(label))
  ) {
    props.onClick?.();
  }
  const children = Array.isArray(props.children) ? props.children : [props.children];
  for (const child of children) press(child as ReactNode, label);
}

describe("skill page", () => {
  it("shows the latest skill, a diff, and both commands away from the star map", () => {
    const onCopy = vi.fn();
    const onAck = vi.fn();
    const tree = SkillPage({
      origin: "http://127.0.0.1:3000",
      markdown: "---\ntitle: now\n---\n新句子\n",
      previous: "---\ntitle: now\n---\n旧句子\n",
      loading: false,
      error: null,
      updated: true,
      copied: null,
      onCopy,
      onAck,
    });
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain("发现 oneself skill 有更新，请升级 skill");
    expect(markup).toContain("npx skills add http://127.0.0.1:3000 -a &lt;agent&gt; -s oneself -y");
    expect(markup).toContain("npx skills update oneself");
    expect(markup).toContain("diff-del");
    expect(markup).toContain("旧句子");
    expect(markup).toContain("diff-add");
    expect(markup).toContain("新句子");
    expect(markup).toContain("当前 Skill");
    expect(markup).toContain('class="skill-copy"');
    expect(markup).toContain('class="skill-ack"');
    expect(markup).not.toContain("btn-glass");
    press(tree, "复制安装");
    expect(onCopy).toHaveBeenCalledWith("install");
    press(tree, "已更新");
    expect(onAck).toHaveBeenCalled();
  });

  it("does not invent a diff when no previous copy was stored", () => {
    const onCopy = vi.fn();
    const tree = SkillPage({
      origin: "http://127.0.0.1:3000",
      markdown: "---\ntitle: now\n---\n",
      previous: null,
      loading: false,
      error: null,
      updated: false,
      copied: null,
      onCopy,
      onAck: () => undefined,
    });
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain("还没有上一份");
    expect(markup).not.toContain("发现 oneself skill 有更新");
    expect(markup).not.toContain("已更新");
    expect(markup).toContain("npx skills add http://127.0.0.1:3000 -a &lt;agent&gt; -s oneself -y");
    expect(markup).toContain("npx skills update oneself");
    expect(markup).toContain('class="skill-copy"');
    expect(markup).not.toContain("btn-glass");
    expect(markup).not.toContain("skill-ack");
    press(tree, "复制升级");
    expect(onCopy).toHaveBeenCalledWith("update");
  });
});
