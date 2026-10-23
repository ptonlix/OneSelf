import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { READ_GRANT_NOTICE, SITE_RELEASE_NOTICE } from "./copy";
import {
  HomeView,
  LOADING_OVERVIEW,
  runLimited,
  STATUS_CONCURRENCY,
  type OverviewData,
  type OverviewProps,
} from "./overview";
import type { ApiKeyRequest, SiteActivation, SourceDraft } from "./types";
import {
  ApiKeyApprovalView,
  ApiKeyCreateView,
  DeviceApprovalView,
  LoginView,
  PasswordView,
  Shell,
  SiteApprovalView,
} from "./views";

const notice = "读权限包含该 source 的全部未删除私有页";

const drafts: SourceDraft[] = [{ id: "notes", read: true, write: false, visibility: false }];

const apiKey: ApiKeyRequest = {
  id: "req_1",
  label: "laptop",
  unrestricted_data: false,
  site_write: false,
  sources: drafts,
  status: "pending",
  expires_at: "2026-05-21T00:15:00Z",
};

const activation: SiteActivation = {
  id: "act_1",
  release_id: "public-page",
  status: "pending",
  expires_at: "2026-05-21T00:15:00Z",
};

function html(node: ReactNode): string {
  return renderToStaticMarkup(node);
}

function expectNoticeBeforeConfirm(markup: string): void {
  const noticeAt = markup.indexOf(notice);
  const confirmAt = markup.indexOf(">确认<");
  expect(noticeAt).toBeGreaterThanOrEqual(0);
  expect(confirmAt).toBeGreaterThan(noticeAt);
}

describe("approval pages", () => {
  it("uses the required private-page sentence and concise site copy", () => {
    expect(READ_GRANT_NOTICE).toBe(notice);
    expect(SITE_RELEASE_NOTICE).toContain("预览");
    expect(SITE_RELEASE_NOTICE).toContain("批准");
    expect(SITE_RELEASE_NOTICE).toContain("指针不会自动移动");
  });

  it("puts the sentence before device confirmation and does not mint a key", () => {
    const markup = html(
      createElement(DeviceApprovalView, {
        userCode: "WDJB-MJHT",
        siteWrite: false,
        drafts,
        message: null,
        pending: false,
        done: false,
        directoriesReady: true,
        onUserCode: () => undefined,
        onSiteWrite: () => undefined,
        onToggle: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    expectNoticeBeforeConfirm(markup);
    expect(markup).not.toContain("osk_");
    expect(markup).toContain("不创建 API Key");

    const done = html(
      createElement(DeviceApprovalView, {
        userCode: "WDJB-MJHT",
        siteWrite: false,
        drafts,
        message: null,
        pending: false,
        done: true,
        directoriesReady: true,
        onUserCode: () => undefined,
        onSiteWrite: () => undefined,
        onToggle: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    expect(done).not.toContain(">确认<");
    expect(done).not.toContain("osk_");
    expect(done).toContain("没有创建 API Key");
  });

  it("puts the sentence before api key confirmation and shows the key only after it", () => {
    const before = html(
      createElement(ApiKeyApprovalView, {
        request: apiKey,
        message: null,
        pending: false,
        revealedKey: null,
        origin: "https://me.example.com",
        copied: false,
        onConfirm: () => undefined,
        onCopy: () => undefined,
      }),
    );
    expectNoticeBeforeConfirm(before);
    expect(before).not.toContain("osk_");

    const after = html(
      createElement(ApiKeyApprovalView, {
        request: { ...apiKey, status: "confirmed" },
        message: null,
        pending: false,
        revealedKey: "osk_once",
        origin: "https://me.example.com",
        copied: false,
        onConfirm: () => undefined,
        onCopy: () => undefined,
      }),
    );
    expect(after.indexOf(">确认<")).toBe(-1);
    expect(after).toContain("osk_once");
    expect(after).toContain("只显示这一次");
    expect(after).toContain("Authorization: ApiKey osk_once");
    expect(after).toContain("X-Api-Key: osk_once");
  });

  it("puts the site notice, not the read-grant sentence, before site confirmation", () => {
    const markup = html(
      createElement(SiteApprovalView, {
        activation,
        currentPointer: "public-page",
        now: Date.parse("2026-05-21T00:05:00Z"),
        message: null,
        pending: false,
        outcome: null,
        onDecide: () => undefined,
      }),
    );
    // Site approval is about release and pointer, not read grants (decision 23).
    expect(markup).not.toContain(notice);
    const siteAt = markup.indexOf(SITE_RELEASE_NOTICE);
    expect(siteAt).toBeGreaterThanOrEqual(0);
    expect(markup.indexOf(">确认<")).toBeGreaterThan(siteAt);
    expect(markup.indexOf(">拒绝<")).toBeGreaterThan(markup.indexOf(">确认<"));
  });
});

const noop = (): undefined => undefined;

function deviceView(done: boolean): string {
  return html(
    createElement(DeviceApprovalView, {
      userCode: "WDJB-MJHT",
      siteWrite: false,
      drafts,
      message: null,
      pending: false,
      done,
      directoriesReady: true,
      onUserCode: noop,
      onSiteWrite: noop,
      onToggle: noop,
      onSubmit: noop,
    }),
  );
}

describe("admin shell", () => {
  it("has six entries, marks the current one and links the public home", () => {
    const markup = html(
      createElement(Shell, {
        showNav: true,
        route: { name: "api-key", id: "req_1" },
        host: "me.example.com",
        onNavigate: noop,
        onLogout: noop,
        children: "body",
      }),
    );
    for (const label of ["概览", "批准设备码", "API Key", "站点上线", "修改密码", "登出"]) {
      expect(markup).toContain(`>${label}<`);
    }
    expect(markup.match(/class="nav-i/g)).toHaveLength(5);
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toMatch(/<a[^>]*class="nav-i on"[^>]*aria-current="page"[^>]*>.*?API Key/);
    expect(markup).toContain('href="/"');
    expect(markup).toContain('id="side-mark-g"');
  });

  it("draws only the page when the navigation is hidden", () => {
    const markup = html(
      createElement(Shell, {
        showNav: false,
        route: { name: "password" },
        host: "",
        onNavigate: noop,
        onLogout: noop,
        children: "body",
      }),
    );
    expect(markup).not.toContain("nav-i");
    expect(markup).toContain("body");
  });
});

describe("login and password screens", () => {
  it("shows the mark, the starfield and the reset hint as a tooltip on login", () => {
    const markup = html(
      createElement(LoginView, { message: null, pending: false, onSubmit: noop, onLogout: null }),
    );
    expect(markup).toContain('id="auth-mark-g"');
    expect(markup).toContain('data-stars="380"');
    expect(markup).toContain(">登录<");
    expect(markup).toContain('aria-describedby="reset-tip"');
    const tip = /<span id="reset-tip" role="tooltip"[^>]*>([\s\S]*?)<\/span>/.exec(markup);
    expect(tip?.[1]?.replace(/<[^>]+>/g, "")).toBe(
      "忘记密码时，在 .env 里设置 OWNER_RESET_PASSWORD 并重启服务",
    );
    expect(markup).toContain('<label for="login-password">密码</label>');
    expect(markup).toContain('id="login-password"');
    for (const removed of ["没有邮箱找回", "Argon2id", "HttpOnly", "每分钟"]) {
      expect(markup).not.toContain(removed);
    }
  });

  it("animates the login orbit and keeps the top-strip mark static", () => {
    const markup = html(
      createElement(LoginView, { message: null, pending: false, onSubmit: noop, onLogout: null }),
    );
    for (const name of ["o1", "o2", "o3"]) expect(markup).toContain(`logo-orbit ${name}`);
    expect(markup).toContain('class="logo-core"');
    expect(markup).toContain('class="logo-ring"');
    for (const name of ["lp1", "lp2", "lp3", "lp4"]) expect(markup).toContain(`pl-x ${name}`);
    expect(markup).toContain("orb-tilt lt0");
    expect(markup).toContain('class="orb-dash"');
    const strip = markup.slice(markup.indexOf("lg-top"), markup.indexOf("lg-body"));
    expect(strip).toContain('id="auth-mark-g"');
    expect(strip).not.toContain("logo-orbit");
  });

  it("keeps logout on the forced password screen", () => {
    const markup = html(
      createElement(PasswordView, {
        message: null,
        pending: false,
        locked: true,
        onSubmit: noop,
        onLogout: noop,
      }),
    );
    expect(markup).toContain(">登出<");
    expect(markup).toContain(">保存密码<");
    expect(markup).not.toContain("nav-i");
  });
});

function previewBody(markup: string): unknown {
  const match = /<pre[^>]*aria-label="请求体预览"[^>]*>([\s\S]*?)<\/pre>/.exec(markup);
  const inner = match?.[1] ?? "";
  const text = inner
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
  return JSON.parse(text);
}

describe("api key request preview", () => {
  it("sends no sources when all data is chosen", () => {
    const markup = html(
      createElement(ApiKeyCreateView, {
        label: "laptop",
        unrestrictedData: true,
        siteWrite: true,
        drafts,
        message: null,
        pending: false,
        directoriesReady: true,
        onLabel: noop,
        onUnrestricted: noop,
        onSiteWrite: noop,
        onToggle: noop,
        onSubmit: noop,
      }),
    );
    expect(previewBody(markup)).toEqual({
      label: "laptop",
      unrestricted_data: true,
      site_write: true,
      sources: [],
    });
    expect(markup).not.toContain("osk_");
    expect(markup).toContain(notice);
    expect(markup).not.toContain(SITE_RELEASE_NOTICE);
  });
});

describe("site approval", () => {
  it("links the preview and offers both decisions while pending", () => {
    const markup = html(
      createElement(SiteApprovalView, {
        activation,
        currentPointer: "rel_0123456789abcdef0123456789abcdef",
        now: Date.parse("2026-05-21T00:05:00Z"),
        message: null,
        pending: false,
        outcome: null,
        onDecide: noop,
      }),
    );
    expect(markup).toContain('href="/_preview/public-page/"');
    expect(markup).toContain(">确认<");
    expect(markup).toContain(">拒绝<");
    expect(markup).toContain("10:00");
    expect(markup).toContain("rel_0123456789abcdef0123456789abcdef");
  });

  it("offers no decision once expired", () => {
    const markup = html(
      createElement(SiteApprovalView, {
        activation,
        currentPointer: "public-page",
        now: Date.parse("2026-05-21T00:20:00Z"),
        message: null,
        pending: false,
        outcome: null,
        onDecide: noop,
      }),
    );
    expect(markup).not.toContain(">确认<");
    expect(markup).not.toContain(">拒绝<");
    expect(markup).toContain("已过期");
  });
});

describe("device approval hint", () => {
  it("says the grant can be revoked from the overview", () => {
    const hint = "之后可在概览的「已批准设备」里单独作废这条授权，下一次请求即失效";
    const markup = deviceView(false);
    expect(markup).toContain(hint);
    expect(markup.indexOf(hint)).toBeGreaterThan(markup.indexOf(">确认<"));
  });
});

const ready = <T>(value: T): { state: "ready"; value: T } => ({ state: "ready", value });

const overviewData: OverviewData = {
  sources: ready([
    { id: "profile", status: ready({ id: "profile", page_count: 6, latest_write_at: null }) },
    { id: "notes", status: { state: "error", message: "服务暂时不可用" } },
  ]),
  publicCounts: ready({ profile: 2 }),
  apiKeys: ready([
    {
      id: "key_live",
      label: "laptop-agent",
      unrestricted_data: false,
      site_write: true,
      sources: [{ id: "profile", read: true, write: true, visibility: false }],
      created_at: "2026-05-01T00:00:00Z",
      last_used_at: null,
      revoked_at: null,
    },
    {
      id: "key_old",
      label: "old-script",
      unrestricted_data: true,
      site_write: false,
      sources: [],
      created_at: "2026-04-01T00:00:00Z",
      last_used_at: "2026-04-02T00:00:00Z",
      revoked_at: "2026-04-03T00:00:00Z",
    },
  ]),
  sites: ready({
    pointer: "public-page",
    releases: [{ id: "rel_0123456789abcdef0123456789abcdef", created_at: "2026-05-02T00:00:00Z" }],
  }),
  grants: ready([
    {
      id: "grant_live_0001",
      site_write: true,
      sources: [{ id: "notes", read: true, write: false, visibility: false }],
      created_at: "2026-05-03T00:00:00Z",
      revoked_at: null,
    },
    {
      id: "grant_gone_0002",
      site_write: false,
      sources: [{ id: "profile", read: true, write: false, visibility: false }],
      created_at: "2026-05-01T00:00:00Z",
      revoked_at: "2026-05-04T00:00:00Z",
    },
  ]),
};

function overviewProps(change: Partial<OverviewProps> = {}): OverviewProps {
  return {
    data: overviewData,
    greeting: "晚上好",
    armedKey: null,
    armedGrant: null,
    keyPending: false,
    grantPending: false,
    keyMessage: null,
    grantMessage: null,
    onNavigate: noop,
    onArmKey: noop,
    onRevokeKey: noop,
    onArmGrant: noop,
    onRevokeGrant: noop,
    ...change,
  };
}

type Node = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

function elements(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap((child: ReactNode) => elements(child));
  if (!isValidElement(node)) return [];
  const element = node as Node;
  return [element, ...elements(element.props.children)];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child: ReactNode) => textOf(child)).join("");
  if (!isValidElement(node)) return "";
  return textOf((node as Node).props.children);
}

function row(tree: ReactNode, key: string): Node {
  const found = elements(tree).find((element) => element.type === "li" && element.key === key);
  if (found === undefined) throw new Error(`no row ${key}`);
  return found;
}

function buttons(node: Node): Node[] {
  return elements(node).filter((element) => element.type === "button");
}

function press(node: Node, label: string): void {
  const button = buttons(node).find((element) => textOf(element) === label);
  if (button === undefined) throw new Error(`no button ${label}`);
  button.props.onClick?.();
}

function section(markup: string, label: string): string {
  const start = markup.indexOf(`aria-label="${label}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = markup.indexOf("</section>", start);
  return markup.slice(start, end);
}

describe("overview", () => {
  it("lists keys without key material and shows revoked keys without an action", () => {
    const tree = HomeView(overviewProps());
    const markup = html(tree);
    expect(markup).not.toContain("osk_");
    expect(markup).not.toContain("key_hash");
    expect(buttons(row(tree, "key_old"))).toHaveLength(0);
    expect(textOf(row(tree, "key_old"))).toContain("revoked");
    expect(buttons(row(tree, "key_live")).map((button) => textOf(button))).toEqual(["作废"]);
  });

  it("revokes a key only on the second click", () => {
    const onArmKey = vi.fn();
    const onRevokeKey = vi.fn();
    press(row(HomeView(overviewProps({ onArmKey, onRevokeKey })), "key_live"), "作废");
    expect(onArmKey).toHaveBeenCalledWith("key_live");
    expect(onRevokeKey).not.toHaveBeenCalled();

    const armed = row(
      HomeView(overviewProps({ armedKey: "key_live", onArmKey, onRevokeKey })),
      "key_live",
    );
    expect(buttons(armed).map((button) => textOf(button))).toEqual(["确认作废", "取消"]);
    press(armed, "确认作废");
    expect(onRevokeKey).toHaveBeenCalledWith("key_live");
  });

  it("links every release preview, never the live root, and shows the site notice instead of the read-grant sentence", () => {
    const sites = section(html(HomeView(overviewProps())), "站点");
    expect(sites).toContain('href="/_preview/public-page/"');
    expect(sites).toContain('href="/_preview/rel_0123456789abcdef0123456789abcdef/"');
    expect(sites).not.toContain('href="/"');
    expect(sites).not.toContain(notice);
    expect(sites).toContain(SITE_RELEASE_NOTICE);
  });

  it("shows per-source failures and keeps other panels when one fails", () => {
    const markup = html(
      HomeView(
        overviewProps({
          data: { ...overviewData, apiKeys: { state: "error", message: "服务暂时不可用" } },
        }),
      ),
    );
    expect(markup).toContain("notes：读取失败");
    expect(section(markup, "API Key")).toContain("读取失败：服务暂时不可用");
    expect(section(markup, "站点")).toContain("/_preview/public-page/");
    expect(section(markup, "已批准设备")).toContain("grant_…0001");
  });

  it("renders while every panel is still loading", () => {
    expect(html(HomeView(overviewProps({ data: LOADING_OVERVIEW })))).toContain("正在读取");
  });
});

describe("approved devices", () => {
  it("shows grants without tokens and revoked grants without an action", () => {
    const tree = HomeView(overviewProps());
    const panel = section(html(tree), "已批准设备");
    expect(panel).not.toMatch(/token|refresh|hash/i);
    expect(panel).toContain("site:write");
    expect(buttons(row(tree, "grant_gone_0002"))).toHaveLength(0);
    expect(textOf(row(tree, "grant_gone_0002"))).toContain("revoked");
  });

  it("revokes a grant only on the second click", () => {
    const onArmGrant = vi.fn();
    const onRevokeGrant = vi.fn();
    press(row(HomeView(overviewProps({ onArmGrant, onRevokeGrant })), "grant_live_0001"), "作废");
    expect(onArmGrant).toHaveBeenCalledWith("grant_live_0001");
    expect(onRevokeGrant).not.toHaveBeenCalled();
    press(
      row(
        HomeView(overviewProps({ armedGrant: "grant_live_0001", onArmGrant, onRevokeGrant })),
        "grant_live_0001",
      ),
      "确认作废",
    );
    expect(onRevokeGrant).toHaveBeenCalledWith("grant_live_0001");
  });
});

describe("source status reads", () => {
  it("never run more than four at once", async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    await runLimited([1, 2, 3, 4, 5, 6, 7, 8, 9], STATUS_CONCURRENCY, async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push(item);
      running -= 1;
    });
    expect(STATUS_CONCURRENCY).toBe(4);
    expect(peak).toBe(4);
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
