// Small building blocks shared by the admin views. Plain functions that return host elements,
// so tests can walk the tree and press buttons without a DOM.
import { createElement, useState, type ReactElement, type ReactNode } from "react";
import { readInputChecked } from "./browser";
import { READ_GRANT_NOTICE, SITE_RELEASE_NOTICE } from "./copy";
import { Icon, type IconName } from "./icons";
import { hrefFor, type AdminRoute } from "./routes";
import type { SourceGrant } from "./types";

export type Props = Record<string, unknown> & {
  key?: string | undefined;
  className?: string | undefined;
};

export function h(tag: string, props: Props | null, ...children: ReactNode[]): ReactElement {
  return createElement(tag, props, ...children);
}

export function message(text: string | null): ReactElement | null {
  if (text === null || text === "") return null;
  return h("p", { className: "note danger", role: "alert" }, text);
}

export function ReadGrantNotice(): ReactElement {
  return h(
    "div",
    { className: "note" },
    createElement(Icon, { name: "shield", size: 16 }),
    h("div", null, READ_GRANT_NOTICE),
  );
}

export function SiteReleaseNotice(): ReactElement {
  return h(
    "div",
    { className: "note" },
    createElement(Icon, { name: "globe", size: 16 }),
    h("div", null, SITE_RELEASE_NOTICE),
  );
}

export function pageHead(
  kicker: string,
  title: string,
  lede: ReactNode,
  aside: ReactNode = null,
): ReactElement {
  return h(
    "header",
    { className: "ph-head" },
    h(
      "div",
      null,
      h("div", { className: "kicker teal" }, kicker),
      h("h1", null, title),
      h("p", { className: "lede" }, lede),
    ),
    aside,
  );
}

export function chip(text: ReactNode, kind = "", key?: string): ReactElement {
  return h("span", { className: kind === "" ? "chip" : `chip ${kind}`, key }, text);
}

export function srcDot(index: number): ReactElement {
  return h("span", { className: `src-dot dot-${String(index % 4)}`, "aria-hidden": "true" });
}

export function toggle(props: {
  checked: boolean;
  title: ReactNode;
  detail: ReactNode;
  onChange: (value: boolean) => void;
}): ReactElement {
  return h(
    "label",
    { className: "tog" },
    h("input", {
      className: "sr-only",
      type: "checkbox",
      checked: props.checked,
      onChange: (event: { currentTarget: EventTarget | null }) => {
        props.onChange(readInputChecked(event.currentTarget));
      },
    }),
    h("span", { className: "switch", "aria-hidden": "true" }),
    h(
      "span",
      null,
      h("span", { className: "t" }, props.title),
      h("span", { className: "d" }, props.detail),
    ),
  );
}

export function iconOrb(name: IconName): ReactElement {
  return h(
    "span",
    { className: "icon-orb", "aria-hidden": "true" },
    createElement(Icon, { name, size: 16 }),
  );
}

type TipState = "auto" | "open" | "shut";

/**
 * A small circled "i" whose tooltip shows on hover and on keyboard focus (CSS), toggles on tap or
 * click, and hides on Escape until the pointer or focus leaves (WCAG 1.4.13).
 */
export function InfoTip(props: { id: string; label: string; text: ReactNode }): ReactElement {
  const [state, setState] = useState<TipState>("auto");
  return h(
    "span",
    {
      className: state === "auto" ? "tip" : `tip ${state}`,
      onMouseLeave: () => {
        setState("auto");
      },
    },
    h(
      "button",
      {
        type: "button",
        className: "tip-btn",
        "aria-label": props.label,
        "aria-describedby": props.id,
        onClick: () => {
          setState((current) => (current === "open" ? "shut" : "open"));
        },
        onKeyDown: (event: { key: string }) => {
          if (event.key === "Escape") setState("shut");
        },
        onBlur: () => {
          setState("auto");
        },
      },
      createElement(Icon, { name: "info", size: 15 }),
    ),
    h("span", { id: props.id, role: "tooltip", className: "tip-bubble" }, props.text),
  );
}

export function navLink(
  content: ReactNode,
  route: AdminRoute,
  onNavigate: (route: AdminRoute) => void,
  extra: Props = {},
): ReactElement {
  return h(
    "a",
    {
      ...extra,
      href: hrefFor(route),
      onClick: (event: { preventDefault(): void }) => {
        event.preventDefault();
        onNavigate(route);
      },
    },
    content,
  );
}

/** Chips for what a credential may do: source rights, all data, site:write. */
export function grantChips(input: {
  sources: readonly SourceGrant[];
  siteWrite: boolean;
  unrestrictedData?: boolean;
}): ReactElement[] {
  const chips: ReactElement[] = [];
  if (input.unrestrictedData === true) chips.push(chip("全部数据", "agent", "all"));
  for (const source of input.sources) {
    const rights = [
      source.read ? "读" : null,
      source.write ? "写" : null,
      source.visibility ? "改可见性" : null,
    ].filter((right): right is string => right !== null);
    chips.push(
      chip(`${source.id} · ${rights.length === 0 ? "无" : rights.join(" ")}`, "", source.id),
    );
  }
  if (input.siteWrite) chips.push(chip("site:write", "scope", "site"));
  return chips;
}

export function grantRows(sources: readonly SourceGrant[]): ReactElement {
  if (sources.length === 0) return h("p", { className: "body-s" }, "没有单独列出的目录。");
  return h(
    "ul",
    { className: "grant-list" },
    ...sources.map((source, index) =>
      h(
        "li",
        { key: source.id, className: "grant" },
        h("span", { className: "n mono" }, srcDot(index), source.id),
        h(
          "span",
          { className: "rights" },
          right("读", source.read),
          right("写", source.write),
          right("改可见性", source.visibility),
        ),
      ),
    ),
  );
}

function right(label: string, on: boolean): ReactElement {
  return h("span", { className: on ? "right on" : "right" }, on ? label : `不${label}`);
}

export function kv(rows: readonly (readonly [string, ReactNode])[]): ReactElement {
  return h(
    "dl",
    { className: "kv" },
    ...rows.flatMap(([key, value]) => [
      h("dt", { key: `${key}-k` }, key),
      h("dd", { key: `${key}-v` }, value),
    ]),
  );
}

/** Local wall-clock time, minute precision. Falls back to the raw text if it is not a date. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function zoneLabel(at: Date = new Date()): string {
  const minutes = -at.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return `UTC${sign}${String(hours)}${rest === 0 ? "" : `:${String(rest).padStart(2, "0")}`}`;
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) return `${String(Math.floor(minutes / 60))} 小时 ${String(minutes % 60)} 分`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function previewPath(releaseId: string): string {
  return `/_preview/${encodeURIComponent(releaseId)}/`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "待批准";
    case "approved":
    case "confirmed":
      return "已批准";
    case "rejected":
      return "已拒绝";
    case "expired":
      return "已过期";
    default:
      return status;
  }
}

/** Shortened grant id for lists; the full id stays in the title attribute. */
export function shortId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;
}

/** Shortened release id (`rel_0b09c4…a85b`); `public-page` stays as it is. */
export function shortRelease(id: string): string {
  return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}
