import { createElement, type ReactElement, type ReactNode } from "react";

import { readInputValue } from "./browser";
import { connectCommand } from "./continuity";
import { capturePointer, pointerOutside } from "./dom";
import { Icon } from "./icons";
import { proseBlocks, type ProseInline } from "./nebula-prose";
import { h } from "./parts";
import type { AdminGraph, GraphPage } from "./types";

export type NebulaSelection =
  | { readonly kind: "source"; readonly id: string }
  | { readonly kind: "page"; readonly key: string }
  | null;

export function NebulaHome(props: {
  readonly graph: AdminGraph | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly selection: NebulaSelection;
  readonly onSelect: (selection: NebulaSelection) => void;
  readonly onSkyDown: (x: number, y: number, target: EventTarget | null) => void;
  readonly onSkyMove: (x: number, y: number) => void;
  readonly onSkyUp: (x: number, y: number, target: EventTarget | null, outside: boolean) => void;
  readonly onSkyCancel: () => void;
  readonly onWheel: (input: {
    ctrlKey: boolean;
    deltaX: number;
    deltaY: number;
    deltaMode: number;
  }) => void;
  readonly armed: string | null;
  readonly pending: boolean;
  readonly onArm: (id: string | null) => void;
  readonly onDelete: (id: string) => void;
  readonly pageMarkdown: string | null;
  readonly pageLoading: boolean;
  readonly connectOrigin: string | null;
  readonly showConnect: boolean;
  readonly webgl: boolean;
  readonly reducedMotion: boolean;
  readonly zoom: number;
  readonly onZoom: (slider: number) => void;
}): ReactElement {
  const graph = props.graph;
  return h(
    "div",
    { className: props.reducedMotion ? "nebula-home reduced" : "nebula-home" },
    h(
      "div",
      {
        className: "nebula-sky",
        "data-nebula": "sky",
        "data-webgl": props.webgl ? "yes" : "no",
        onPointerDown: (event: {
          button: number;
          pointerId: number;
          clientX: number;
          clientY: number;
          target: EventTarget | null;
          currentTarget: EventTarget | null;
        }) => {
          if (event.button !== 0) return;
          capturePointer(event.currentTarget, event.pointerId);
          props.onSkyDown(event.clientX, event.clientY, event.target);
        },
        onPointerMove: (event: { clientX: number; clientY: number }) => {
          props.onSkyMove(event.clientX, event.clientY);
        },
        onPointerUp: (event: {
          clientX: number;
          clientY: number;
          target: EventTarget | null;
          currentTarget: EventTarget | null;
        }) => {
          props.onSkyUp(
            event.clientX,
            event.clientY,
            event.target,
            pointerOutside(event.currentTarget, event.clientX, event.clientY),
          );
        },
        onPointerCancel: () => {
          props.onSkyCancel();
        },
        onWheel: (event: {
          preventDefault(): void;
          ctrlKey: boolean;
          deltaX: number;
          deltaY: number;
          deltaMode: number;
        }) => {
          event.preventDefault();
          props.onWheel(event);
        },
      },
      h("canvas", { className: "nebula-canvas", "aria-hidden": "true" }),
      // Do not set React `hidden` on these names. projectLabels owns that property;
      // a zoom re-render would hide them again, and reduced motion has no frame loop.
      h(
        "div",
        { className: props.webgl ? "nebula-labels" : "nebula-labels fallback" },
        ...(graph?.sources ?? []).map((source) =>
          h(
            "button",
            {
              key: source.id,
              type: "button",
              className: "cloud-label",
              "data-source": source.id,
              onClick: () => {
                props.onSelect({ kind: "source", id: source.id });
              },
            },
            source.id,
          ),
        ),
        ...(graph?.pages ?? []).map((page) =>
          h(
            "button",
            {
              key: pageKey(page),
              type: "button",
              className: "pname",
              "data-key": pageKey(page),
              onClick: () => {
                props.onSelect({ kind: "page", key: pageKey(page) });
              },
            },
            page.title,
          ),
        ),
        ...brokenLabels(graph).map((label) =>
          h("span", { key: label, className: "pname broken", "data-ghost": label }, label),
        ),
      ),
    ),
    props.showConnect && props.connectOrigin !== null
      ? h(
          "p",
          { className: "nebula-connect" },
          h("code", null, connectCommand(props.connectOrigin)),
        )
      : null,
    graph?.truncated === true ? h("p", { className: "nebula-note" }, "星图没画全") : null,
    !props.webgl && graph !== null
      ? h("p", { className: "nebula-note" }, "无法显示星图，下面是页名。")
      : null,
    props.loading ? h("p", { className: "nebula-note" }, "正在读取…") : null,
    props.error !== null ? h("p", { className: "nebula-note", role: "alert" }, props.error) : null,
    props.webgl
      ? h(
          "label",
          { className: "nebula-zoom" },
          h("span", { className: "zoom-far", "aria-hidden": "true" }),
          h("input", {
            type: "range",
            min: "0",
            max: "100",
            step: "1",
            value: String(Math.round(props.zoom * 100)),
            "aria-label": "缩放，向右拉近",
            onChange: (event: { currentTarget: EventTarget | null }) => {
              props.onZoom(Number(readInputValue(event.currentTarget)) / 100);
            },
          }),
          h("span", { className: "zoom-near", "aria-hidden": "true" }),
        )
      : null,
    dock(props),
  );
}

function dock(props: {
  graph: AdminGraph | null;
  selection: NebulaSelection;
  armed: string | null;
  pending: boolean;
  onArm: (id: string | null) => void;
  onDelete: (id: string) => void;
  onSelect: (selection: NebulaSelection) => void;
  pageMarkdown: string | null;
  pageLoading: boolean;
}): ReactNode {
  const selection = props.selection;
  if (props.graph === null || selection === null) return null;
  if (selection.kind === "source") {
    const source = props.graph.sources.find((item) => item.id === selection.id);
    if (source === undefined) return null;
    const pages = props.graph.pages.filter((page) => page.source === source.id);
    return drawer(
      "目录",
      props,
      h("h2", null, source.id),
      h("p", { className: "dock-quiet" }, `${String(source.page_count)} 页`),
      h(
        "ul",
        { className: "dock-pages" },
        ...pages.map((page) =>
          h(
            "li",
            { key: pageKey(page) },
            h(
              "button",
              {
                type: "button",
                onClick: () => {
                  props.onSelect({ kind: "page", key: pageKey(page) });
                },
              },
              page.title,
            ),
          ),
        ),
      ),
      confirmButton(`source:${source.id}`, "删除目录", props),
    );
  }
  const page = props.graph.pages.find((item) => pageKey(item) === selection.key);
  if (page === undefined) return null;
  const outgoing = props.graph.links.filter((link) => linkKey(link.from) === pageKey(page));
  const incoming = props.graph.links.filter((link) => linkKey(link.to) === pageKey(page));
  return drawer(
    "页",
    props,
    h("p", { className: "dock-quiet" }, page.visibility === "public" ? "公开" : "私有"),
    h("h2", null, page.title),
    h("p", { className: "mono dock-path" }, pageKey(page)),
    prose(props),
    page.media_types.length === 0
      ? null
      : h("p", { className: "dock-quiet" }, page.media_types.join("、")),
    linkList(
      "指出",
      outgoing.map((link) => link.to),
      props.onSelect,
    ),
    linkList(
      "指回",
      incoming.map((link) => link.from),
      props.onSelect,
    ),
    confirmButton(`page:${pageKey(page)}`, "删除这一页", props),
  );
}

function drawer(
  label: string,
  props: { onSelect: (selection: NebulaSelection) => void },
  ...children: ReactNode[]
): ReactElement {
  return h(
    "aside",
    { className: "nebula-dock", "aria-label": label },
    h(
      "button",
      {
        className: "dock-close",
        type: "button",
        "aria-label": "关闭",
        onClick: () => {
          props.onSelect(null);
        },
      },
      createElement(Icon, { name: "chevron", size: 16 }),
    ),
    ...children,
  );
}

function prose(props: {
  pageMarkdown: string | null;
  pageLoading: boolean;
  onSelect: (selection: NebulaSelection) => void;
}): ReactElement {
  if (props.pageLoading) return h("p", { className: "dock-quiet" }, "正在读取正文");
  if (props.pageMarkdown === null) return h("p", { className: "dock-quiet" }, "正文还没读到");
  const blocks = proseBlocks(props.pageMarkdown);
  if (blocks.length === 0) return h("p", { className: "dock-quiet" }, "这一页还没有正文");
  return h(
    "article",
    { className: "nebula-prose" },
    ...blocks.map((block, index) => {
      const key = String(index);
      if (block.kind === "heading") {
        return h(
          block.level === 2 ? "h3" : "h4",
          { key },
          ...inlineNodes(block.inlines, props.onSelect, key),
        );
      }
      if (block.kind === "list") {
        return h(
          "ul",
          { key },
          ...block.items.map((item, itemIndex) =>
            h(
              "li",
              { key: `${key}-${String(itemIndex)}` },
              ...inlineNodes(item, props.onSelect, `${key}-${String(itemIndex)}`),
            ),
          ),
        );
      }
      if (block.kind === "code") return h("pre", { key }, h("code", null, block.text));
      return h("p", { key }, ...inlineNodes(block.inlines, props.onSelect, key));
    }),
  );
}

function inlineNodes(
  parts: readonly ProseInline[],
  onSelect: (selection: NebulaSelection) => void,
  prefix: string,
): ReactNode[] {
  return parts.map((part, index) => {
    const key = `${prefix}-${String(index)}`;
    if (part.kind === "strong") return h("strong", { key }, part.text);
    if (part.kind === "code") return h("code", { key }, part.text);
    if (part.kind === "link") {
      return h(
        "button",
        {
          key,
          type: "button",
          className: "prose-link",
          onClick: () => {
            onSelect({ kind: "page", key: part.key });
          },
        },
        part.label,
      );
    }
    return part.text;
  });
}

function linkList(
  title: string,
  ends: readonly { readonly source: string; readonly slug: string }[],
  onSelect: (selection: NebulaSelection) => void,
): ReactElement | null {
  if (ends.length === 0) return null;
  return h(
    "div",
    { className: "dock-links" },
    h("p", { className: "dock-quiet" }, title),
    h(
      "ul",
      null,
      ...ends.map((end) =>
        h(
          "li",
          { key: linkKey(end) },
          h(
            "button",
            {
              type: "button",
              onClick: () => {
                onSelect({ kind: "page", key: linkKey(end) });
              },
            },
            linkKey(end),
          ),
        ),
      ),
    ),
  );
}

function confirmButton(
  id: string,
  label: string,
  props: {
    armed: string | null;
    pending: boolean;
    onArm: (id: string | null) => void;
    onDelete: (id: string) => void;
  },
): ReactElement {
  if (props.armed !== id) {
    return h(
      "button",
      {
        className: "btn btn-sm btn-danger",
        type: "button",
        disabled: props.pending,
        onClick: () => {
          props.onArm(id);
        },
      },
      label,
    );
  }
  return h(
    "button",
    {
      className: "btn btn-sm btn-danger",
      type: "button",
      disabled: props.pending,
      onClick: () => {
        props.onDelete(id);
      },
    },
    "确认删除",
  );
}

function brokenLabels(graph: AdminGraph | null): string[] {
  if (graph === null) return [];
  const live = new Set(graph.pages.map((page) => pageKey(page)));
  const labels = new Set<string>();
  for (const link of graph.links) {
    if (!link.broken) continue;
    const label = linkKey(link.to);
    if (!live.has(label)) labels.add(label);
  }
  return [...labels];
}

function pageKey(page: Pick<GraphPage, "source" | "slug">): string {
  return `${page.source}/${page.slug}`;
}

function linkKey(end: { readonly source: string; readonly slug: string }): string {
  return `${end.source}/${end.slug}`;
}
