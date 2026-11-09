import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NebulaHome } from "./nebula-view";
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

  it("opens a right drawer and shows the page body without frontmatter", () => {
    const onSelect = vi.fn();
    press(home({ onSelect }), "现居上海");
    expect(onSelect).toHaveBeenCalledWith({ kind: "page", key: "health/now" });
    const markup = html(
      home({
        selection: { kind: "page", key: "health/now" },
        pageMarkdown: "---\ntitle: 现居上海\n---\n2018 年到 2024 年，做研发。\n\n- 网关项目\n",
      }),
    );
    expect(markup).toContain("nebula-dock");
    expect(markup).toContain("2018 年到 2024 年");
    expect(markup).toContain("网关项目");
    expect(markup).not.toContain("title: 现居上海");
    expect(markup).not.toContain("<textarea");
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
