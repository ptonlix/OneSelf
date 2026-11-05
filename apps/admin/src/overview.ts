// The admin overview: source orbit and counts, quick actions, API keys, site releases and
// approved devices. Each panel carries its own loading/error state so one failure stays local.
import { createElement, type ReactElement, type ReactNode } from "react";
import { Icon, SourceOrbit, type OrbitSource } from "./icons";
import {
  connectCommand,
  deletedRows,
  directoryActions,
  hasNextPage,
  pageControls,
  pageSlice,
  recentRows,
  type RecordsTab,
} from "./continuity";
import {
  chip,
  formatTime,
  grantChips,
  h,
  iconOrb,
  message,
  navLink,
  previewPath,
  shortId,
  shortRelease,
  SiteReleaseNotice,
} from "./parts";
import type { AdminRoute } from "./routes";
import type {
  ApiKeySummary,
  DeletedSource,
  OauthGrantView,
  QueryPage,
  SiteList,
  SourceStatus,
} from "./types";

type Panel<T> =
  | { readonly state: "loading" }
  | { readonly state: "error"; readonly message: string }
  | { readonly state: "ready"; readonly value: T };

export interface SourceRow {
  id: string;
  status: Panel<SourceStatus>;
}

export interface OverviewData {
  sources: Panel<SourceRow[]>;
  publicCounts: Panel<Record<string, number>>;
  apiKeys: Panel<ApiKeySummary[]>;
  sites: Panel<SiteList>;
  grants: Panel<OauthGrantView[]>;
  deletedSources: Panel<DeletedSource[]>;
  recent: Panel<QueryPage[]>;
  connectOrigin: Panel<string>;
}

export const LOADING_OVERVIEW: OverviewData = {
  sources: { state: "loading" },
  publicCounts: { state: "loading" },
  apiKeys: { state: "loading" },
  sites: { state: "loading" },
  grants: { state: "loading" },
  deletedSources: { state: "loading" },
  recent: { state: "loading" },
  connectOrigin: { state: "loading" },
};

/** Status reads run at most this many at a time. */
export const STATUS_CONCURRENCY = 4;

/** Runs `task` over `items` with at most `limit` in flight; each item reports on its own. */
export async function runLimited<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next] as T;
      next += 1;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

export function countPublic(pages: readonly { source: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const page of pages) counts[page.source] = (counts[page.source] ?? 0) + 1;
  return counts;
}

export interface OverviewProps {
  data: OverviewData;
  greeting: string;
  armedKey: string | null;
  armedGrant: string | null;
  keyPending: boolean;
  grantPending: boolean;
  keyMessage: string | null;
  grantMessage: string | null;
  onNavigate: (route: AdminRoute) => void;
  onArmKey: (id: string | null) => void;
  onRevokeKey: (id: string) => void;
  onArmGrant: (id: string | null) => void;
  onRevokeGrant: (id: string) => void;
}

export interface RecordsProps {
  data: Pick<OverviewData, "sources" | "deletedSources" | "recent">;
  directoryMessage: string | null;
  armedDelete: string | null;
  armedRestore: string | null;
  directoryPending: boolean;
  tab: RecordsTab;
  onTab: (tab: RecordsTab) => void;
  directoryPage: number;
  deletedPage: number;
  recentPage: number;
  deletedHasMore: boolean;
  recentHasMore: boolean;
  onDirectoryPage: (page: number) => void;
  onDeletedPage: (page: number) => void;
  onRecentPage: (page: number) => void;
  onArmDelete: (id: string | null) => void;
  onDeleteSource: (id: string) => void;
  onArmRestore: (id: string | null) => void;
  onRestoreSource: (id: string) => void;
}

export function HomeView(props: OverviewProps): ReactElement {
  return h(
    "section",
    { className: "page overview" },
    h(
      "header",
      { className: "ph-head" },
      h(
        "div",
        null,
        h("div", { className: "kicker teal" }, "Overview"),
        h("h1", null, props.greeting),
        h("p", { className: "lede" }, "目录、凭据和站点都在这里。密钥原文只在批准后出现一次。"),
      ),
    ),
    orbitCard(props.data),
    connectPanel(props),
    quickCards(props.onNavigate),
    h("div", { className: "g2" }, keyPanel(props), sitePanel(props.data.sites)),
    grantPanel(props),
  );
}

const RECORD_TABS: readonly { readonly id: RecordsTab; readonly label: string }[] = [
  { id: "directories", label: "目录" },
  { id: "deleted", label: "已删除目录" },
  { id: "recent", label: "最近写入" },
];

export function RecordsView(props: RecordsProps): ReactElement {
  return h(
    "section",
    { className: "page records" },
    h(
      "header",
      { className: "ph-head" },
      h(
        "div",
        null,
        h("div", { className: "kicker teal" }, "Records"),
        h("h1", null, "资料"),
        h("p", { className: "lede" }, "删除目录、恢复 30 天内删掉的目录，并查看最近写入。"),
      ),
    ),
    h(
      "div",
      { className: "rec-tabs", role: "tablist", "aria-label": "资料分类" },
      ...RECORD_TABS.map((tab) =>
        h(
          "button",
          {
            key: tab.id,
            type: "button",
            className: "rec-tab",
            role: "tab",
            "aria-selected": props.tab === tab.id,
            onClick: () => {
              props.onTab(tab.id);
            },
          },
          tab.label,
        ),
      ),
    ),
    recordsList(props),
  );
}

function recordsList(props: RecordsProps): ReactElement {
  if (props.tab === "deleted") return deletedList(props);
  if (props.tab === "recent") return recentList(props);
  return directoryList(props);
}

function directoryList(props: RecordsProps): ReactElement {
  return h(
    "section",
    { className: "card", "aria-label": "目录" },
    h(
      "div",
      { className: "card-h" },
      h("h3", null, "目录"),
      h("span", { className: "cap" }, "删除需要再确认一次"),
    ),
    message(props.directoryMessage),
    panelState(props.data.sources, (rows) => {
      const page = pageSlice(rows, props.directoryPage);
      return h(
        "div",
        null,
        page.length === 0
          ? h("p", { className: "card-b body-s" }, "还没有目录。")
          : h(
              "ul",
              { className: "list" },
              ...page.map((row) =>
                h(
                  "li",
                  { key: `dir-${row.id}`, className: "li" },
                  h("div", { className: "li-main" }, h("div", { className: "t" }, row.id)),
                  directoryActions({
                    id: row.id,
                    armed: props.armedDelete === row.id,
                    pending: props.directoryPending,
                    onArm: props.onArmDelete,
                    onDelete: props.onDeleteSource,
                  }),
                ),
              ),
            ),
        pageControls({
          page: props.directoryPage,
          hasNext: hasNextPage(rows.length, props.directoryPage),
          onPage: props.onDirectoryPage,
        }),
      );
    }),
  );
}

function deletedList(props: RecordsProps): ReactElement {
  return h(
    "section",
    { className: "card", "aria-label": "已删除目录" },
    h(
      "div",
      { className: "card-h" },
      h("h3", null, "已删除目录"),
      h("span", { className: "cap" }, "30 天内可恢复"),
    ),
    panelState(props.data.deletedSources, (rows) =>
      h(
        "div",
        null,
        rows.length === 0
          ? h("p", { className: "card-b body-s" }, "没有可恢复的目录。")
          : deletedRows(
              rows,
              props.armedRestore,
              props.directoryPending,
              props.onArmRestore,
              props.onRestoreSource,
            ),
        pageControls({
          page: props.deletedPage,
          hasNext: props.deletedHasMore,
          onPage: props.onDeletedPage,
        }),
      ),
    ),
  );
}

function recentList(props: RecordsProps): ReactElement {
  return h(
    "section",
    { className: "card", "aria-label": "最近写入" },
    h(
      "div",
      { className: "card-h" },
      h("h3", null, "最近写入"),
      h("span", { className: "cap" }, "只读，不含正文"),
    ),
    panelState(props.data.recent, (rows) =>
      h(
        "div",
        null,
        rows.length === 0
          ? h("p", { className: "card-b body-s" }, "还没有写入。")
          : recentRows(rows),
        pageControls({
          page: props.recentPage,
          hasNext: props.recentHasMore,
          onPage: props.onRecentPage,
        }),
      ),
    ),
  );
}

function connectPanel(props: OverviewProps): ReactElement | null {
  const keys = props.data.apiKeys;
  const grants = props.data.grants;
  if (keys.state !== "ready" || grants.state !== "ready") return null;
  const activeKey = keys.value.some((key) => key.revoked_at === null);
  const approved = grants.value.some((grant) => grant.revoked_at === null);
  if (activeKey || approved) return null;
  return h(
    "section",
    { className: "card", "aria-label": "接入" },
    h("div", { className: "card-h" }, h("h3", null, "接入 Agent")),
    panelState(props.data.connectOrigin, (origin) =>
      h(
        "div",
        { className: "card-b" },
        h("p", { className: "body-s" }, "把这条命令交给正在对话的 Agent。它会申请设备码。"),
        h("p", { className: "mono" }, connectCommand(origin)),
        h("p", { className: "body-s" }, "到 /admin/device 批准设备码。"),
        h("p", { className: "body-s" }, "API Key 只给脚本或长期密钥，不是第一次对话的接入方式。"),
      ),
    ),
  );
}

function panelState<T>(panel: Panel<T>, render: (value: T) => ReactNode): ReactNode {
  if (panel.state === "loading")
    return h("p", { className: "card-b body-s", role: "status" }, "正在读取…");
  if (panel.state === "error") {
    return h("p", { className: "card-b note danger", role: "alert" }, `读取失败：${panel.message}`);
  }
  return render(panel.value);
}

function orbitCard(data: OverviewData): ReactElement {
  const rows = data.sources.state === "ready" ? data.sources.value : [];
  const counts = data.publicCounts.state === "ready" ? data.publicCounts.value : null;
  const caption = (row: SourceRow): string => {
    if (row.status.state === "loading") return "读取中";
    if (row.status.state === "error") return "读取失败";
    const pages = `${String(row.status.value.page_count)} 页`;
    if (counts === null) return pages;
    return `${pages} · ${String(counts[row.id] ?? 0)} 公开`;
  };
  const orbit: OrbitSource[] = rows.map((row) => ({
    id: row.id,
    caption: caption(row),
    isPublic: counts !== null && (counts[row.id] ?? 0) > 0,
  }));
  const pageTotal = rows.reduce(
    (sum, row) => sum + (row.status.state === "ready" ? row.status.value.page_count : 0),
    0,
  );
  const publicTotal = counts === null ? null : Object.values(counts).reduce((a, b) => a + b, 0);
  const keys = data.apiKeys.state === "ready" ? data.apiKeys.value : null;
  const activeKeys = keys?.filter((key) => key.revoked_at === null).length;
  const pointer = data.sites.state === "ready" ? data.sites.value.pointer : null;
  return h(
    "section",
    { className: "card orbit-card" },
    h(
      "div",
      { className: "orbit-view" },
      data.sources.state === "ready"
        ? createElement(SourceOrbit, { sources: orbit })
        : panelState(data.sources, () => null),
      data.sources.state === "ready" && rows.length === 0
        ? h("p", { className: "body-s" }, "还没有目录。Agent 写入第一页后会出现在这里。")
        : null,
      h(
        "ul",
        { className: "sr-only" },
        ...orbit.map((source) => h("li", { key: source.id }, `${source.id}：${source.caption}`)),
      ),
    ),
    h(
      "div",
      { className: "stats" },
      stat(
        "Sources",
        data.sources.state === "ready" ? String(rows.length) : "—",
        `共 ${String(pageTotal)} 页`,
      ),
      stat(
        "Public",
        publicTotal === null ? "—" : String(publicTotal),
        data.publicCounts.state === "error" ? "读取失败" : "公开页",
      ),
      stat(
        "API Keys",
        activeKeys === undefined ? "—" : String(activeKeys),
        keys === null ? "—" : `${String(keys.length - (activeKeys ?? 0))} 把已作废`,
      ),
      stat(
        "Site",
        pointer === null ? "—" : shortRelease(pointer),
        pointer === null
          ? data.sites.state === "error"
            ? "读取失败"
            : "—"
          : chip(pointer === "public-page" ? "live · 内置页" : "live · release", "public"),
        "mono",
      ),
    ),
  );
}

function stat(label: string, value: string, detail: ReactNode, tone = ""): ReactElement {
  return h(
    "div",
    { className: "stat", key: label },
    h("div", { className: "cap" }, label),
    h("div", { className: tone === "" ? "v" : `v ${tone}` }, value),
    h("div", { className: "body-s" }, detail),
  );
}

function quickCards(onNavigate: (route: AdminRoute) => void): ReactElement {
  const card = (
    icon: "device" | "key" | "globe",
    title: string,
    detail: string,
    action: ReactElement,
  ): ReactElement =>
    h(
      "section",
      { className: "card quick", key: title },
      iconOrb(icon),
      h("h3", { className: "q-t" }, title),
      h("p", { className: "body-s" }, detail),
      action,
    );
  return h(
    "div",
    { className: "quick-row" },
    card(
      "device",
      "批准设备码",
      "输入 Agent 给你的用户码",
      h(
        "form",
        {
          className: "row q-code",
          onSubmit: (event: { preventDefault(): void; currentTarget?: unknown }) => {
            event.preventDefault();
            onNavigate({ name: "device", userCode: formCode(event.currentTarget) });
          },
        },
        h("input", {
          className: "input mono",
          name: "user_code",
          type: "text",
          autoComplete: "off",
          placeholder: "XXXX-XXXX",
          "aria-label": "用户码",
        }),
        h(
          "button",
          { className: "btn btn-light q-go", type: "submit", "aria-label": "去批准" },
          createElement(Icon, { name: "arrow", size: 16 }),
        ),
      ),
    ),
    card(
      "key",
      "发起 API Key",
      "按目录勾选读、写、改可见性",
      navLink("新建申请", { name: "api-key-new" }, onNavigate, { className: "btn btn-glass wide" }),
    ),
    card(
      "globe",
      "申请站点上线",
      "填写 public-page 或 rel_…",
      navLink("发起申请", { name: "site-new" }, onNavigate, { className: "btn btn-glass wide" }),
    ),
  );
}

function formCode(form: unknown): string {
  if (typeof form !== "object" || form === null || !("elements" in form)) return "";
  const item = (form as { elements: { namedItem(name: string): unknown } }).elements.namedItem(
    "user_code",
  );
  if (typeof item !== "object" || item === null || !("value" in item)) return "";
  const value = (item as { value?: unknown }).value;
  return typeof value === "string" ? value.trim() : "";
}

function revokeControls(input: {
  id: string;
  armed: boolean;
  pending: boolean;
  onArm: (id: string | null) => void;
  onRevoke: (id: string) => void;
}): ReactElement {
  if (!input.armed) {
    return h(
      "button",
      {
        className: "btn btn-sm btn-danger",
        type: "button",
        disabled: input.pending,
        onClick: () => {
          input.onArm(input.id);
        },
      },
      "作废",
    );
  }
  return h(
    "span",
    { className: "row confirm" },
    h(
      "button",
      {
        className: "btn btn-sm btn-danger",
        type: "button",
        disabled: input.pending,
        onClick: () => {
          input.onRevoke(input.id);
        },
      },
      "确认作废",
    ),
    h(
      "button",
      {
        className: "btn btn-sm btn-ghost",
        type: "button",
        disabled: input.pending,
        onClick: () => {
          input.onArm(null);
        },
      },
      "取消",
    ),
  );
}

function keyPanel(props: OverviewProps): ReactElement {
  return h(
    "section",
    { className: "card", "aria-label": "API Key" },
    h(
      "div",
      { className: "card-h" },
      h("h3", null, "API Key"),
      h("span", { className: "cap" }, "原文不保存，只能作废"),
    ),
    message(props.keyMessage),
    panelState(props.data.apiKeys, (keys) =>
      keys.length === 0
        ? h("p", { className: "card-b body-s" }, "还没有 API Key。")
        : h(
            "ul",
            { className: "list" },
            ...keys.map((key) =>
              h(
                "li",
                { key: key.id, className: key.revoked_at === null ? "li" : "li revoked" },
                iconOrb("key"),
                h(
                  "div",
                  { className: "li-main" },
                  h("div", { className: "t" }, key.label),
                  h(
                    "div",
                    { className: "s" },
                    key.revoked_at === null
                      ? `最近使用 ${key.last_used_at === null ? "从未" : formatTime(key.last_used_at)} · 创建于 ${formatTime(key.created_at)}`
                      : `作废于 ${formatTime(key.revoked_at)} · 创建于 ${formatTime(key.created_at)}`,
                  ),
                ),
                h(
                  "div",
                  { className: "row chips" },
                  ...grantChips({
                    sources: key.sources,
                    siteWrite: key.site_write,
                    unrestrictedData: key.unrestricted_data,
                  }),
                ),
                key.revoked_at === null
                  ? revokeControls({
                      id: key.id,
                      armed: props.armedKey === key.id,
                      pending: props.keyPending,
                      onArm: props.onArmKey,
                      onRevoke: props.onRevokeKey,
                    })
                  : chip("revoked", "danger"),
              ),
            ),
          ),
    ),
  );
}

function sitePanel(sites: Panel<SiteList>): ReactElement {
  return h(
    "section",
    { className: "card", "aria-label": "站点" },
    h(
      "div",
      { className: "card-h" },
      h("h3", null, "站点"),
      h("span", { className: "cap" }, "上线需要你批准"),
    ),
    panelState(sites, (list) => {
      const releases = [...list.releases].sort((a, b) =>
        a.created_at === b.created_at
          ? a.id < b.id
            ? 1
            : -1
          : a.created_at < b.created_at
            ? 1
            : -1,
      );
      const rows: { id: string; detail: string }[] = [
        { id: "public-page", detail: "内置首页" },
        ...releases.map((release) => ({
          id: release.id,
          detail: `上传于 ${formatTime(release.created_at)}`,
        })),
      ];
      return h(
        "ul",
        { className: "list" },
        ...rows.map((row) =>
          h(
            "li",
            { key: row.id, className: "li" },
            iconOrb("globe"),
            h(
              "div",
              { className: "li-main" },
              h("div", { className: "t mono", title: row.id }, shortRelease(row.id)),
              h("div", { className: "s" }, row.detail),
            ),
            row.id === list.pointer ? chip("live", "public") : null,
            h(
              "a",
              {
                className: "btn btn-sm btn-ghost",
                href: previewPath(row.id),
                target: "_blank",
                rel: "noopener",
              },
              "预览",
              createElement(Icon, { name: "external", size: 14 }),
            ),
          ),
        ),
      );
    }),
    h("div", { className: "card-b" }, SiteReleaseNotice()),
  );
}

function grantPanel(props: OverviewProps): ReactElement {
  return h(
    "section",
    { className: "card", "aria-label": "已批准设备" },
    h(
      "div",
      { className: "card-h" },
      h("h3", null, "已批准设备"),
      h("span", { className: "cap" }, "设备码授权 · 没有名称，按批准时间区分"),
    ),
    message(props.grantMessage),
    panelState(props.data.grants, (grants) =>
      grants.length === 0
        ? h("p", { className: "card-b body-s" }, "还没有批准过设备。")
        : h(
            "ul",
            { className: "list" },
            ...grants.map((grant) =>
              h(
                "li",
                { key: grant.id, className: grant.revoked_at === null ? "li" : "li revoked" },
                iconOrb("device"),
                h(
                  "div",
                  { className: "li-main" },
                  h("div", { className: "t mono", title: grant.id }, shortId(grant.id)),
                  h(
                    "div",
                    { className: "s" },
                    grant.revoked_at === null
                      ? `批准于 ${formatTime(grant.created_at)}`
                      : `批准于 ${formatTime(grant.created_at)} · 作废于 ${formatTime(grant.revoked_at)}`,
                  ),
                ),
                h(
                  "div",
                  { className: "row chips" },
                  ...grantChips({
                    sources: grant.sources,
                    siteWrite: grant.site_write,
                    unrestrictedData: grant.unrestricted_data,
                  }),
                ),
                grant.revoked_at === null
                  ? revokeControls({
                      id: grant.id,
                      armed: props.armedGrant === grant.id,
                      pending: props.grantPending,
                      onArm: props.onArmGrant,
                      onRevoke: props.onRevokeGrant,
                    })
                  : chip("revoked", "danger"),
              ),
            ),
          ),
    ),
  );
}

export function greetingFor(hour: number): string {
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 13) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}
