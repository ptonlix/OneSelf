import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { applyPreviewDialog, releasePreviewInert } from "./dom";
import { NebulaHome, previewDialogPlan } from "./nebula-view";
import { DeviceApprovalView } from "./views";
import type { AdminGraph } from "./types";

const graph: AdminGraph = {
  truncated: false,
  sources: [{ id: "health", page_count: 1 }],
  pages: [
    {
      source: "health",
      slug: "now",
      type: "note",
      title: "现居上海",
      visibility: "private",
      updated_at: "2026-01-01T00:00:00.000Z",
      file_count: 1,
      media_types: ["image/jpeg"],
    },
  ],
  links: [
    {
      from: { source: "health", slug: "now" },
      to: { source: "work", slug: "old-role" },
      broken: true,
    },
  ],
};

function home(extra: Partial<Parameters<typeof NebulaHome>[0]> = {}) {
  return NebulaHome({
    graph,
    loading: false,
    error: null,
    selection: null,
    onSelect: () => undefined,
    onSkyDown: () => undefined,
    onSkyMove: () => undefined,
    onSkyUp: () => undefined,
    onSkyCancel: () => undefined,
    onWheel: () => undefined,
    armed: null,
    pending: false,
    onArm: () => undefined,
    onDelete: () => undefined,
    onVisibility: () => undefined,
    pageMarkdown: null,
    pageLoading: false,
    connectOrigin: "http://127.0.0.1:3000",
    showConnect: false,
    webgl: true,
    reducedMotion: false,
    zoom: 0.2,
    onZoom: () => undefined,
    ...extra,
  });
}

function html(node: ReactNode): string {
  return renderToStaticMarkup(node);
}

function press(node: ReactNode, label: string): void {
  if (!isValidElement(node)) return;
  const props = node.props as { children?: ReactNode; onClick?: () => void };
  if (typeof props.children === "string" && props.children.includes(label)) props.onClick?.();
  const children = Array.isArray(props.children) ? props.children : [props.children];
  for (const child of children) press(child as ReactNode, label);
}

function clickOverlay(node: ReactNode, backdrop: boolean): void {
  if (!isValidElement(node)) return;
  const props = node.props as {
    className?: string;
    onClick?: (event: { target: EventTarget | null; currentTarget: EventTarget | null }) => void;
    children?: ReactNode;
  };
  if (props.className === "nebula-modal") {
    const current = {} as EventTarget;
    props.onClick?.({
      target: backdrop ? current : ({} as EventTarget),
      currentTarget: current,
    });
    return;
  }
  const children = Array.isArray(props.children) ? props.children : [props.children];
  for (const child of children) clickOverlay(child as ReactNode, backdrop);
}

function pressLabel(node: ReactNode, label: string): void {
  if (!isValidElement(node)) return;
  const props = node.props as {
    children?: ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
  };
  if (props["aria-label"] === label) props.onClick?.();
  const children = Array.isArray(props.children) ? props.children : [props.children];
  for (const child of children) pressLabel(child as ReactNode, label);
}

describe("nebula home", () => {
  it("shows page titles and does not replace the sidebar menu", () => {
    const markup = html(home());
    expect(markup).not.toContain("晚上好");
    expect(markup).not.toContain("批准设备码");
    expect(markup).toContain("现居上海");
    expect(markup).toContain('data-source="health"');
    expect(markup).toContain("work/old-role");
    expect(markup).not.toContain("nebula-list");
    expect(markup).not.toContain("file_");
  });

  it("shows the connect command without removing the sky", () => {
    const markup = html(home({ showConnect: true }));
    expect(markup).toContain("npx skills add http://127.0.0.1:3000");
    expect(markup).toContain('data-nebula="sky"');
  });

  it("puts a zoom slider at the bottom left that grows toward the right", () => {
    const onZoom = vi.fn();
    const tree = home({ onZoom, zoom: 0.2 });
    expect(html(tree)).toContain("向右拉近");
    const input = findInput(tree);
    const change = input.props.onChange as (event: { currentTarget: { value: string } }) => void;
    change({ currentTarget: { value: "80" } });
    expect(onZoom).toHaveBeenCalledWith(0.8);
  });

  it("does not open the dock while dragging and does not zoom on a plain wheel", () => {
    const onSelect = vi.fn();
    const onWheel = vi.fn();
    const tree = home({ onSelect, onWheel });
    const sky = findSky(tree);
    const down = sky.props.onPointerDown as (event: {
      button: number;
      clientX: number;
      clientY: number;
      target: null;
    }) => void;
    down({ button: 0, clientX: 0, clientY: 0, target: null });
    (sky.props.onPointerMove as (event: { clientX: number; clientY: number }) => void)({
      clientX: 30,
      clientY: 4,
    });
    expect(onSelect).not.toHaveBeenCalled();
    (
      sky.props.onWheel as (event: {
        preventDefault(): void;
        ctrlKey: boolean;
        deltaX: number;
        deltaY: number;
        deltaMode: number;
      }) => void
    )({
      preventDefault: () => undefined,
      ctrlKey: false,
      deltaX: 2,
      deltaY: 8,
      deltaMode: 0,
    });
    expect(onWheel).toHaveBeenCalledWith(expect.objectContaining({ ctrlKey: false, deltaY: 8 }));
  });

  it("opens a centered preview and shows the page body without frontmatter", () => {
    const onSelect = vi.fn();
    press(home({ onSelect }), "现居上海");
    expect(onSelect).toHaveBeenCalledWith({ kind: "page", key: "health/now" });
    const selected = home({
      onSelect,
      selection: { kind: "page", key: "health/now" },
      pageMarkdown: "---\ntitle: 现居上海\n---\n2018 年到 2024 年，做研发。\n\n- 网关项目\n",
    });
    const markup = html(selected);
    expect(markup).toContain("nebula-modal");
    expect(markup).toContain("nebula-read");
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("2018 年到 2024 年");
    expect(markup).toContain("网关项目");
    expect(markup).not.toContain("title: 现居上海");
    expect(markup).not.toContain("<textarea");
    clickOverlay(selected, true);
    expect(onSelect).toHaveBeenCalledWith(null);
    onSelect.mockClear();
    clickOverlay(selected, false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("previews quotes and tables instead of the markdown source", () => {
    const markup = html(
      home({
        selection: { kind: "page", key: "health/now" },
        pageMarkdown:
          "---\ntitle: 日记\n---\n> 一句话：先补控制面。\n\n| 项目 | 结果 |\n| --- | --- |\n| OneSelf | 已发布 |\n\n## 今日概览\n",
      }),
    );
    expect(markup).toContain("<blockquote");
    expect(markup).toContain("一句话：先补控制面。");
    expect(markup).not.toContain("> 一句话");
    expect(markup).toContain("<table");
    expect(markup).toContain("<th");
    expect(markup).toContain("已发布");
    expect(markup).not.toContain("| 项目 |");
    expect(markup).toContain("今日概览");
    expect(markup).not.toContain("<textarea");
  });

  it("keeps a single aria-modal while the visibility confirm is open", () => {
    const preview = html(home({ selection: { kind: "page", key: "health/now" } }));
    expect(preview.match(/aria-modal="true"/g)).toHaveLength(1);
    expect(openingTag(preview, "nebula-dock nebula-read")).toContain('aria-modal="true"');
    expect(openingTag(preview, "nebula-dock nebula-read")).toContain('tabindex="-1"');
    const directory = html(home({ selection: { kind: "source", id: "health" } }));
    expect(directory.match(/aria-modal="true"/g)).toHaveLength(1);
    expect(openingTag(directory, "nebula-dock")).toContain('tabindex="-1"');

    const armed = html(
      home({
        selection: { kind: "page", key: "health/now" },
        armed: "visibility:health/now",
      }),
    );
    expect(armed.match(/aria-modal="true"/g)).toHaveLength(1);
    expect(openingTag(armed, "nebula-dock nebula-read")).not.toContain("aria-modal");
    expect(openingTag(armed, "vis-card")).toContain('aria-modal="true"');
    expect(openingTag(armed, "vis-card")).toContain('tabindex="-1"');

    const missing = html(
      home({
        selection: { kind: "page", key: "health/now" },
        armed: "visibility:missing/page",
      }),
    );
    expect(missing.match(/aria-modal="true"/g)).toHaveLength(1);
    expect(openingTag(missing, "nebula-dock nebula-read")).toContain('aria-modal="true"');
    expect(missing).not.toContain("vis-card");
  });

  it("nests an indented list and renders a safe image", () => {
    const markup = html(
      home({
        selection: { kind: "page", key: "health/now" },
        pageMarkdown:
          "- parent\n  - child\n\n![封面](https://example.com/a.png)\n![跳过](javascript:alert(1))\n",
      }),
    );
    expect(markup).toContain("<li>parent<ul><li>child</li></ul></li>");
    expect(markup).toContain('src="https://example.com/a.png"');
    expect(markup).toContain('alt="封面"');
    expect(markup).not.toContain("javascript:");
  });

  it("focuses the open dialog and marks the sky and sidebar inert without a document", () => {
    expect(previewDialogPlan({ previewOpen: true, confirmOpen: false })).toEqual({
      inert: true,
      focus: "preview",
      escape: "close",
    });
    expect(previewDialogPlan({ previewOpen: true, confirmOpen: true })).toEqual({
      inert: true,
      focus: "confirm",
      escape: "disarm",
    });
    expect(previewDialogPlan({ previewOpen: false, confirmOpen: false })).toEqual({
      inert: false,
      focus: null,
      escape: "ignore",
    });
    const sky = { inert: false };
    const side = { inert: false };
    const preview = { focus: vi.fn() };
    const confirm = { focus: vi.fn() };
    applyPreviewDialog({
      sky,
      side,
      preview,
      confirm,
      plan: previewDialogPlan({ previewOpen: true, confirmOpen: false }),
    });
    expect(sky.inert).toBe(true);
    expect(side.inert).toBe(true);
    expect(preview.focus).toHaveBeenCalledOnce();
    expect(confirm.focus).not.toHaveBeenCalled();
    confirm.focus.mockClear();
    applyPreviewDialog({
      sky,
      side,
      preview,
      confirm,
      plan: previewDialogPlan({ previewOpen: true, confirmOpen: true }),
    });
    expect(confirm.focus).toHaveBeenCalledOnce();
    releasePreviewInert(sky, side);
    expect(sky.inert).toBe(false);
    expect(side.inert).toBe(false);
  });

  it("does not change visibility until the second click", () => {
    const onVisibility = vi.fn();
    const onArm = vi.fn();
    const selected = { selection: { kind: "page" as const, key: "health/now" } };
    pressLabel(home({ ...selected, onArm, onVisibility }), "修改可见性");
    expect(onVisibility).not.toHaveBeenCalled();
    expect(onArm).toHaveBeenCalledWith("visibility:health/now");
    const opened = html(home({ ...selected, armed: "visibility:health/now", onVisibility }));
    expect(opened).toContain('role="dialog"');
    expect(opened).toContain("改为公开");
    expect(opened).toContain("立刻匿名可读");
    expect(opened).toContain("站点包");
    expect(opened).toContain("不必重新上线");
    expect(opened).not.toContain("<textarea");
    press(home({ ...selected, armed: "visibility:health/now", onVisibility }), "确认");
    expect(onVisibility).toHaveBeenCalledWith("health", "now", "public");
    const cancel = vi.fn();
    press(home({ ...selected, armed: "visibility:health/now", onArm: cancel }), "取消");
    expect(cancel).toHaveBeenCalledWith(null);
    const directory = html(home({ selection: { kind: "source", id: "health" } }));
    expect(directory).not.toContain("修改可见性");
  });

  it("names the next public read before hiding a page", () => {
    const page = graph.pages[0];
    if (page === undefined) throw new Error("missing page");
    const markup = html(
      home({
        selection: { kind: "page", key: "health/now" },
        graph: {
          ...graph,
          pages: [{ ...page, visibility: "public" }],
        },
        armed: "visibility:health/now",
      }),
    );
    expect(markup).toContain("下一次公开读取不再返回这一页和这些原件");
    expect(markup).toContain("站点包里已有的副本还在");
    expect(markup).not.toContain("<textarea");
  });

  it("does not delete until the second click", () => {
    const onDelete = vi.fn();
    const onArm = vi.fn();
    press(home({ selection: { kind: "page", key: "health/now" }, onArm, onDelete }), "删除这一页");
    expect(onDelete).not.toHaveBeenCalled();
    expect(onArm).toHaveBeenCalledWith("page:health/now");
    press(
      home({ selection: { kind: "page", key: "health/now" }, armed: "page:health/now", onDelete }),
      "确认删除",
    );
    expect(onDelete).toHaveBeenCalledWith("page:health/now");
  });

  it("says the sky is incomplete when truncated or WebGL is missing", () => {
    expect(html(home({ graph: { ...graph, truncated: true } }))).toContain("星图没画全");
    expect(html(home({ webgl: false }))).toContain("无法显示星图");
  });

  it("does not mark reduced motion as auto-turning", () => {
    expect(html(home({ reducedMotion: true }))).toContain("reduced");
  });

  it("does not hide page titles when reduced motion is on", () => {
    const markup = html(home({ webgl: true, reducedMotion: true }));
    expect(markup).toContain("现居上海");
    for (const tag of [
      markup.match(/<button[^>]*class="cloud-label"[^>]*>/)?.[0] ?? "",
      markup.match(/<button[^>]*class="pname"[^>]*>/)?.[0] ?? "",
      markup.match(/<span[^>]*class="pname broken"[^>]*>/)?.[0] ?? "",
    ]) {
      expect(tag).not.toBe("");
      expect(tag).not.toContain("hidden");
    }
  });

  it("ignores a non-primary pointer and captures the primary one", () => {
    const onSkyDown = vi.fn();
    const capture = vi.fn();
    const sky = findSky(home({ onSkyDown }));
    const down = sky.props.onPointerDown as (event: {
      button: number;
      pointerId: number;
      clientX: number;
      clientY: number;
      target: null;
      currentTarget: { setPointerCapture(id: number): void } | null;
    }) => void;
    down({
      button: 2,
      pointerId: 3,
      clientX: 4,
      clientY: 6,
      target: null,
      currentTarget: { setPointerCapture: capture },
    });
    expect(onSkyDown).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    down({
      button: 0,
      pointerId: 7,
      clientX: 1,
      clientY: 2,
      target: null,
      currentTarget: { setPointerCapture: capture },
    });
    expect(capture).toHaveBeenCalledWith(7);
    expect(onSkyDown).toHaveBeenCalledWith(1, 2, null);
  });

  it("reports a pointerup outside the sky and cancels without selecting", () => {
    const onSkyUp = vi.fn();
    const onSkyCancel = vi.fn();
    const onSelect = vi.fn();
    const sky = findSky(home({ onSkyUp, onSkyCancel, onSelect }));
    const up = sky.props.onPointerUp as (event: {
      clientX: number;
      clientY: number;
      target: null;
      currentTarget: {
        getBoundingClientRect(): { left: number; right: number; top: number; bottom: number };
      };
    }) => void;
    up({
      clientX: 400,
      clientY: 10,
      target: null,
      currentTarget: {
        getBoundingClientRect: () => ({ left: 0, right: 200, top: 0, bottom: 200 }),
      },
    });
    expect(onSkyUp).toHaveBeenCalledWith(400, 10, null, true);
    (sky.props.onPointerCancel as () => void)();
    expect(onSkyCancel).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("device grants", () => {
  it("lists a grant and does not revoke on the first click", () => {
    const onRevoke = vi.fn();
    const onArm = vi.fn();
    const view = DeviceApprovalView({
      userCode: "WDJB-MJHT",
      unrestrictedData: false,
      siteWrite: false,
      drafts: [],
      message: null,
      pending: false,
      done: false,
      directoriesReady: true,
      onUserCode: () => undefined,
      onUnrestricted: () => undefined,
      onSiteWrite: () => undefined,
      onToggle: () => undefined,
      onSubmit: () => undefined,
      grants: [
        {
          id: "grant_live",
          label: null,
          site_write: false,
          unrestricted_data: false,
          sources: [],
          created_at: "2026-01-01T00:00:00.000Z",
          last_used_at: null,
          expires_at: null,
          revoked_at: null,
        },
      ],
      onArmGrant: onArm,
      onRevokeGrant: onRevoke,
    });
    expect(html(view)).toContain("grant_live");
    expect(html(view)).not.toContain("概览");
    press(view, "作废");
    expect(onRevoke).not.toHaveBeenCalled();
    expect(onArm).toHaveBeenCalledWith("grant_live");
  });

  it("keeps the approved-device list after a successful approval", () => {
    const onRevoke = vi.fn();
    const onArm = vi.fn();
    const view = DeviceApprovalView({
      userCode: "WDJB-MJHT",
      unrestrictedData: false,
      siteWrite: false,
      drafts: [],
      message: null,
      pending: false,
      done: true,
      directoriesReady: true,
      onUserCode: () => undefined,
      onUnrestricted: () => undefined,
      onSiteWrite: () => undefined,
      onToggle: () => undefined,
      onSubmit: () => undefined,
      grants: [
        {
          id: "grant_live",
          label: null,
          site_write: false,
          unrestricted_data: false,
          sources: [],
          created_at: "2026-01-01T00:00:00.000Z",
          last_used_at: null,
          expires_at: null,
          revoked_at: null,
        },
      ],
      onArmGrant: onArm,
      onRevokeGrant: onRevoke,
    });
    const markup = html(view);
    expect(markup).toContain("没有创建 API Key");
    expect(markup).toContain("设备码已批准");
    expect(markup).toContain("grant_live");
    expect(markup).toContain("已批准设备");
    press(view, "作废");
    expect(onRevoke).not.toHaveBeenCalled();
    expect(onArm).toHaveBeenCalledWith("grant_live");
  });
});

function openingTag(markup: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<[^>]*class="${escaped}"[^>]*>`).exec(markup)?.[0] ?? "";
}

function findSky(node: ReactNode): { props: Record<string, unknown> } {
  if (!isValidElement(node)) throw new Error("missing sky");
  const props = node.props as { className?: string; children?: ReactNode };
  if (props.className === "nebula-sky") return { props: node.props as Record<string, unknown> };
  const children = Array.isArray(props.children) ? props.children : [props.children];
  for (const child of children) {
    try {
      return findSky(child as ReactNode);
    } catch {
      /* keep looking */
    }
  }
  throw new Error("missing sky");
}

function findInput(node: ReactNode): { props: Record<string, unknown> } {
  if (!isValidElement(node)) throw new Error("missing slider");
  const props = node.props as { type?: string; children?: ReactNode };
  if (props.type === "range") return { props: node.props as Record<string, unknown> };
  const children = Array.isArray(props.children) ? props.children : [props.children];
  for (const child of children) {
    try {
      return findInput(child as ReactNode);
    } catch {
      /* keep looking */
    }
  }
  throw new Error("missing slider");
}
