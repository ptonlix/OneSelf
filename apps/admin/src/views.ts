import { createElement, type ReactElement, type ReactNode } from "react";
import { readInputChecked, readInputValue } from "./browser";
import { createApiKeyBody } from "./forms";
import { Icon, LoginOrbit, OrbitMark } from "./icons";
import {
  chip,
  formatRemaining,
  formatTime,
  grantChips,
  grantRows,
  h,
  InfoTip,
  kv,
  message,
  navLink,
  pageHead,
  previewPath,
  ReadGrantNotice,
  shortRelease,
  SiteReleaseNotice,
  srcDot,
  statusLabel,
  toggle,
  zoneLabel,
} from "./parts";
import type { AdminRoute } from "./routes";
import { Sky } from "./sky";
import type { ApiKeyRequest, GrantFlag, SiteActivation, SourceDraft } from "./types";

type Section = "home" | "device" | "api-key" | "site" | "password";

const NAV: readonly {
  group: string;
  items: readonly {
    section: Section;
    label: string;
    icon: "home" | "device" | "key" | "globe" | "lock";
    route: AdminRoute;
  }[];
}[] = [
  {
    group: "总览",
    items: [{ section: "home", label: "概览", icon: "home", route: { name: "home" } }],
  },
  {
    group: "授权",
    items: [
      {
        section: "device",
        label: "批准设备码",
        icon: "device",
        route: { name: "device", userCode: "" },
      },
      { section: "api-key", label: "API Key", icon: "key", route: { name: "api-key-new" } },
    ],
  },
  {
    group: "站点",
    items: [{ section: "site", label: "站点上线", icon: "globe", route: { name: "site-new" } }],
  },
  {
    group: "账户",
    items: [{ section: "password", label: "修改密码", icon: "lock", route: { name: "password" } }],
  },
];

function sectionFor(route: AdminRoute): Section {
  switch (route.name) {
    case "device":
      return "device";
    case "api-key-new":
    case "api-key":
      return "api-key";
    case "site-new":
    case "site":
      return "site";
    case "password":
      return "password";
    default:
      return "home";
  }
}

function crumbFor(route: AdminRoute): string {
  switch (route.name) {
    case "device":
      return "批准设备码";
    case "api-key-new":
      return "发起 API Key";
    case "api-key":
      return "批准 API Key";
    case "site-new":
      return "申请站点上线";
    case "site":
      return "批准站点上线";
    case "password":
      return "修改密码";
    default:
      return "概览";
  }
}

/**
 * Signed-in layout: sidebar (mark, grouped entries, current entry, logout) and a top bar
 * (breadcrumb, link to the public home). Without `showNav` only the page itself is drawn, which
 * is how the login, password-gate and loading screens appear.
 */
export function Shell(props: {
  showNav: boolean;
  route: AdminRoute;
  host: string;
  onNavigate: (route: AdminRoute) => void;
  onLogout: () => void;
  children: ReactNode;
}): ReactElement {
  if (!props.showNav) return h("main", { className: "auth" }, props.children);
  const current = sectionFor(props.route);
  return h(
    "div",
    { className: "app" },
    h(
      "aside",
      { className: "side" },
      h(
        "div",
        { className: "side-brand" },
        createElement(OrbitMark, { prefix: "side-mark", size: 30 }),
        h("div", null, h("b", null, "OneSelf"), h("small", { className: "mono" }, props.host)),
      ),
      h(
        "nav",
        { "aria-label": "管理" },
        ...NAV.map((group) =>
          h(
            "div",
            { key: group.group, className: "nav-group" },
            h("div", { className: "grp" }, group.group),
            ...group.items.map((item) =>
              navLink(
                [
                  createElement(Icon, { key: "i", name: item.icon }),
                  h("span", { key: "t" }, item.label),
                ],
                item.route,
                props.onNavigate,
                {
                  key: item.section,
                  className: item.section === current ? "nav-i on" : "nav-i",
                  "aria-current": item.section === current ? "page" : undefined,
                },
              ),
            ),
          ),
        ),
      ),
      h(
        "div",
        { className: "side-foot" },
        h("span", { className: "av", "aria-hidden": "true" }, "O"),
        h("div", null, h("b", null, "所属人"), h("small", null, "管理会话")),
        h(
          "button",
          {
            className: "btn btn-sm btn-ghost logout",
            type: "button",
            onClick: (event: { preventDefault(): void }) => {
              event.preventDefault();
              props.onLogout();
            },
          },
          createElement(Icon, { name: "logout", size: 16 }),
          h("span", null, "登出"),
        ),
      ),
    ),
    h(
      "div",
      { className: "main" },
      h(
        "div",
        { className: "bar" },
        h(
          "nav",
          { className: "crumb", "aria-label": "位置" },
          h("span", null, "管理"),
          h("span", { "aria-hidden": "true" }, "/"),
          h("b", null, crumbFor(props.route)),
        ),
        h("span", { className: "sp" }),
        h(
          "a",
          { className: "btn btn-sm", href: "/", target: "_blank", rel: "noopener" },
          "查看公开主页",
          createElement(Icon, { name: "external", size: 14 }),
        ),
      ),
      h("main", { className: "content" }, props.children),
    ),
  );
}

/** Login and password-gate layout: starfield, top strip, orbit drawing and a glass card. */
function AuthFrame(props: { children: ReactNode }): ReactElement {
  return h(
    "div",
    { className: "lg" },
    createElement(Sky, { stars: 380 }),
    h(
      "header",
      { className: "lg-top" },
      h(
        "div",
        { className: "wrap row" },
        h(
          "span",
          { className: "logo-row" },
          createElement(OrbitMark, { prefix: "auth-mark", size: 28 }),
          h("b", null, "OneSelf"),
          h("span", { className: "cap mono" }, "/admin"),
        ),
        h("span", { className: "sp" }),
        h("a", { className: "btn btn-sm btn-ghost", href: "/" }, "返回公开主页"),
      ),
    ),
    h(
      "div",
      { className: "lg-body" },
      h("div", { className: "lg-orbit", "aria-hidden": "true" }, createElement(LoginOrbit, null)),
      props.children,
    ),
  );
}

/** The small arc between the current and requested pointer, after the site mockup. */
function pointerArc(): ReactElement {
  return createElement(
    "svg",
    {
      className: "ptr-arc",
      viewBox: "0 0 160 48",
      width: 160,
      height: 48,
      "aria-hidden": "true",
    },
    createElement("path", {
      d: "M8 34 Q80 -6 152 34",
      fill: "none",
      stroke: "#93A8FB",
      strokeOpacity: 0.45,
      strokeDasharray: "3 4",
    }),
    createElement("circle", { cx: 8, cy: 34, r: 3.5, fill: "#5EEAD4" }),
    createElement("circle", { cx: 80, cy: 14, r: 6, fill: "none", stroke: "#93A8FB" }),
    createElement("circle", { cx: 80, cy: 14, r: 2.5, fill: "#93A8FB" }),
    createElement("circle", { cx: 152, cy: 34, r: 10, fill: "#C084FC", opacity: 0.18 }),
    createElement("circle", { cx: 152, cy: 34, r: 5, fill: "#C084FC" }),
  );
}

function logoutButton(onLogout: () => void): ReactElement {
  return h(
    "button",
    {
      className: "btn btn-ghost",
      type: "button",
      onClick: (event: { preventDefault(): void }) => {
        event.preventDefault();
        onLogout();
      },
    },
    "登出",
  );
}

export function LoginView(props: {
  message: string | null;
  pending: boolean;
  onSubmit: (login: string, password: string) => void;
  onLogout: (() => void) | null;
}): ReactElement {
  return createElement(
    AuthFrame,
    null,
    h(
      "form",
      {
        className: "glass glass-orbit lg-card rise",
        onSubmit: (event: { preventDefault(): void }) => {
          event.preventDefault();
          const form = eventAsForm(event);
          props.onSubmit(form.login, form.password);
        },
      },
      h("div", { className: "kicker teal" }, "Owner sign in"),
      h("h1", null, "登录管理端"),
      h("p", { className: "body-s" }, "使用所属人登录名。改密完成前，其他管理操作不会打开。"),
      message(props.message),
      h(
        "label",
        { className: "field" },
        h("span", null, "登录名"),
        h("input", { className: "input", name: "login", type: "text", autoComplete: "username" }),
      ),
      h(
        "div",
        { className: "field" },
        h(
          "span",
          { className: "field-h" },
          h("label", { htmlFor: "login-password" }, "密码"),
          createElement(InfoTip, {
            id: "reset-tip",
            label: "忘记密码怎么办",
            text: [
              "忘记密码时，在 ",
              h("code", { key: "env" }, ".env"),
              " 里设置 ",
              h("code", { key: "var" }, "OWNER_RESET_PASSWORD"),
              " 并重启服务",
            ],
          }),
        ),
        h("input", {
          className: "input",
          id: "login-password",
          name: "password",
          type: "password",
          autoComplete: "current-password",
        }),
      ),
      h(
        "button",
        { className: "btn btn-lg btn-orbit wide", type: "submit", disabled: props.pending },
        "登录",
      ),
      props.onLogout === null ? null : logoutButton(props.onLogout),
    ),
  );
}

export function PasswordView(props: {
  message: string | null;
  pending: boolean;
  locked: boolean;
  onSubmit: (password: string) => void;
  onLogout: () => void;
}): ReactElement {
  const form = h(
    "form",
    {
      className: props.locked ? "glass glass-orbit lg-card rise" : "card card-b password-card",
      onSubmit: (event: { preventDefault(): void }) => {
        event.preventDefault();
        props.onSubmit(eventAsForm(event).password);
      },
    },
    props.locked ? h("div", { className: "kicker teal" }, "First sign in") : null,
    props.locked ? h("h1", null, "先设置一个新密码") : null,
    props.locked
      ? h("p", { className: "body-s" }, "必须先改密。在此之前只能留在这一页或登出。")
      : null,
    message(props.message),
    h(
      "label",
      { className: "field" },
      h("span", null, "新密码"),
      h("input", {
        className: "input",
        name: "password",
        type: "password",
        autoComplete: "new-password",
      }),
    ),
    h(
      "div",
      { className: "row actions" },
      h(
        "button",
        { className: "btn btn-orbit", type: "submit", disabled: props.pending },
        "保存密码",
      ),
      logoutButton(props.onLogout),
    ),
    h(
      "div",
      { className: "note info" },
      createElement(Icon, { name: "info", size: 16 }),
      h("div", null, "新密码会替换当前所属人密码，只以 Argon2id 哈希保存。"),
    ),
  );
  if (props.locked) return createElement(AuthFrame, null, form);
  return h(
    "section",
    { className: "page" },
    pageHead("Account", "修改密码", "新密码会替换当前所属人密码。"),
    form,
  );
}

function sourceGrid(
  drafts: readonly SourceDraft[],
  onToggle: (id: string, flag: GrantFlag, value: boolean) => void,
  extra: ReactNode = null,
): ReactElement {
  return h(
    "section",
    { className: "card" },
    h(
      "div",
      { className: "card-h" },
      h("h3", null, "目录权限"),
      h("span", { className: "cap mono" }, `sources · ${String(drafts.length)}`),
      h("span", { className: "sp" }),
      h("span", { className: "cap" }, "读 · 写 · 改可见性"),
    ),
    drafts.length === 0
      ? h("p", { className: "card-b body-s" }, "还没有可授权的目录。")
      : h(
          "div",
          { className: "grant-list" },
          ...drafts.map((draft, index) =>
            h(
              "div",
              { key: draft.id, className: "grant", role: "group", "aria-label": draft.id },
              h("span", { className: "n mono" }, srcDot(index), draft.id),
              h(
                "span",
                { className: "seg" },
                segBox(draft, "read", "读", "r", onToggle),
                segBox(draft, "write", "写", "w", onToggle),
                segBox(draft, "visibility", "改可见性", "v", onToggle),
              ),
            ),
          ),
        ),
    extra === null ? null : h("div", { className: "card-b toggles" }, extra),
  );
}

function segBox(
  draft: SourceDraft,
  flag: GrantFlag,
  label: string,
  tone: string,
  onToggle: (id: string, flag: GrantFlag, value: boolean) => void,
): ReactElement {
  return h(
    "label",
    { key: flag },
    h("input", {
      type: "checkbox",
      checked: draft[flag],
      "aria-label": `${draft.id} ${label}`,
      onChange: (event: { currentTarget: EventTarget | null }) => {
        onToggle(draft.id, flag, readInputChecked(event.currentTarget));
      },
    }),
    h("span", { className: tone }, label),
  );
}

function summaryRows(
  drafts: readonly SourceDraft[],
  siteWrite: boolean,
  extra: readonly (readonly [string, string])[] = [],
): ReactElement {
  const pick = (flag: GrantFlag): string => {
    const ids = drafts.filter((draft) => draft[flag]).map((draft) => draft.id);
    return ids.length === 0 ? "无" : ids.join("、");
  };
  return kv([
    ["可读", pick("read")],
    ["可写", pick("write")],
    ["改可见性", pick("visibility")],
    ["site:write", siteWrite ? "允许" : "不允许"],
    ...extra,
  ]);
}

const DEVICE_REVOKE_HINT = "之后可在概览的「已批准设备」里单独作废这条授权，下一次请求即失效。";

export function DeviceApprovalView(props: {
  userCode: string;
  siteWrite: boolean;
  drafts: readonly SourceDraft[];
  message: string | null;
  pending: boolean;
  done: boolean;
  directoriesReady: boolean;
  onUserCode: (value: string) => void;
  onSiteWrite: (value: boolean) => void;
  onToggle: (id: string, flag: GrantFlag, value: boolean) => void;
  onSubmit: () => void;
}): ReactElement {
  if (props.done) {
    return h(
      "section",
      { className: "page" },
      pageHead(
        "OAuth 2.1 · Device authorization",
        "设备码已批准",
        "已批准这台设备。没有创建 API Key。",
      ),
      h(
        "div",
        { className: "note info" },
        createElement(Icon, { name: "info", size: 16 }),
        h("div", null, DEVICE_REVOKE_HINT),
      ),
    );
  }
  return h(
    "form",
    {
      className: "page",
      onSubmit: (event: { preventDefault(): void }) => {
        event.preventDefault();
        props.onSubmit();
      },
    },
    pageHead(
      "OAuth 2.1 · Device authorization",
      "批准设备码",
      "只保存这一页勾选的 source 三档和可选的 site:write。不创建 API Key，也没有全部数据权限。",
    ),
    message(props.message),
    h(
      "div",
      { className: "g2" },
      h(
        "div",
        { className: "stack" },
        h(
          "section",
          { className: "card card-b glass-orbit code-card" },
          h("div", { className: "kicker" }, "User code"),
          h(
            "label",
            { className: "field" },
            h("span", { className: "sr-only" }, "用户码"),
            h("input", {
              className: "input mono user-code",
              name: "user_code",
              type: "text",
              autoComplete: "off",
              spellCheck: false,
              value: props.userCode,
              placeholder: "XXXX-XXXX",
              onChange: (event: { currentTarget: EventTarget | null }) => {
                props.onUserCode(readInputValue(event.currentTarget));
              },
            }),
          ),
          h("p", { className: "body-s" }, "核对它和 Agent 终端里显示的用户码一致。"),
        ),
        sourceGrid(
          props.drafts,
          props.onToggle,
          toggle({
            checked: props.siteWrite,
            title: ["允许 ", h("code", { key: "c" }, "site:write")],
            detail: "可上传站点并申请上线；上线仍需你另行批准。",
            onChange: props.onSiteWrite,
          }),
        ),
      ),
      h(
        "aside",
        { className: "card card-b summary" },
        h("div", { className: "kicker" }, "授权摘要"),
        summaryRows(props.drafts, props.siteWrite, [["令牌", "access 15 分钟 · refresh 轮换"]]),
        ReadGrantNotice(),
        h(
          "button",
          {
            className: "btn btn-lg btn-orbit wide",
            type: "submit",
            disabled: props.pending || !props.directoriesReady || props.userCode.trim() === "",
          },
          "确认",
        ),
        h("p", { className: "cap" }, DEVICE_REVOKE_HINT),
      ),
    ),
  );
}

export function ApiKeyCreateView(props: {
  label: string;
  unrestrictedData: boolean;
  siteWrite: boolean;
  drafts: readonly SourceDraft[];
  message: string | null;
  pending: boolean;
  directoriesReady: boolean;
  onLabel: (value: string) => void;
  onUnrestricted: (value: boolean) => void;
  onSiteWrite: (value: boolean) => void;
  onToggle: (id: string, flag: GrantFlag, value: boolean) => void;
  onSubmit: () => void;
}): ReactElement {
  const body = createApiKeyBody({
    label: props.label,
    unrestrictedData: props.unrestrictedData,
    siteWrite: props.siteWrite,
    drafts: props.drafts,
  });
  return h(
    "form",
    {
      className: "page",
      onSubmit: (event: { preventDefault(): void }) => {
        event.preventDefault();
        props.onSubmit();
      },
    },
    pageHead(
      "API Key · 第 1 步，共 2 步",
      "发起 API Key",
      "这里只创建待批准申请，不生成密钥。批准后，密钥原文只显示一次。",
    ),
    message(props.message),
    h(
      "div",
      { className: "g2" },
      h(
        "div",
        { className: "stack" },
        h(
          "section",
          { className: "card card-b" },
          h(
            "label",
            { className: "field" },
            h("span", null, "标签"),
            h("input", {
              className: "input",
              type: "text",
              value: props.label,
              placeholder: "例如 laptop-agent",
              onChange: (event: { currentTarget: EventTarget | null }) => {
                props.onLabel(readInputValue(event.currentTarget));
              },
            }),
          ),
          h("p", { className: "cap" }, "用来辨认这把 Key，例如哪台设备、哪个 Agent。"),
          toggle({
            checked: props.unrestrictedData,
            title: "全部数据权限",
            detail: "包含以后新建的目录。打开后，下方目录不会写入申请。",
            onChange: props.onUnrestricted,
          }),
          toggle({
            checked: props.siteWrite,
            title: ["允许 ", h("code", { key: "c" }, "site:write")],
            detail: "可上传站点并申请上线；上线仍需你另行批准。",
            onChange: props.onSiteWrite,
          }),
        ),
        props.unrestrictedData
          ? h(
              "section",
              { className: "card card-b" },
              h("p", { className: "body-s" }, "已选择全部数据权限，目录列表不会写入申请。"),
            )
          : sourceGrid(props.drafts, props.onToggle),
      ),
      h(
        "aside",
        { className: "stack" },
        h(
          "section",
          { className: "card" },
          h(
            "div",
            { className: "card-h" },
            h("span", { className: "cap mono" }, "POST /pcp/v1/api-keys"),
            h("span", { className: "sp" }),
            chip("pending", "pending"),
          ),
          h("pre", { className: "code", "aria-label": "请求体预览" }, ...jsonTokens(body)),
        ),
        ReadGrantNotice(),
        h(
          "button",
          {
            className: "btn btn-lg btn-orbit wide",
            type: "submit",
            disabled: props.pending || !props.directoriesReady || props.label.trim() === "",
          },
          "发起批准",
        ),
        h("p", { className: "cap" }, "生效后的密钥不能改权限；要改，就作废后重新批准一把。"),
      ),
    ),
  );
}

/** Pretty-printed JSON split into highlighted spans for the request preview. */
function jsonTokens(value: unknown): ReactNode[] {
  const text = JSON.stringify(value, null, 2);
  const pattern = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g;
  const out: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index;
    if (at > last) out.push(text.slice(last, at));
    const [whole, quoted, colon, literal] = match;
    if (quoted !== undefined && colon !== undefined) {
      out.push(h("span", { key: String(index), className: "k" }, quoted), colon);
    } else if (quoted !== undefined) {
      out.push(h("span", { key: String(index), className: "s" }, quoted));
    } else if (literal !== undefined) {
      out.push(
        h("span", { key: String(index), className: literal === "true" ? "p" : "n" }, literal),
      );
    } else {
      out.push(h("span", { key: String(index), className: "n" }, whole));
    }
    index += 1;
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function ApiKeyApprovalView(props: {
  request: ApiKeyRequest;
  message: string | null;
  pending: boolean;
  revealedKey: string | null;
  origin: string;
  copied: boolean;
  onConfirm: () => void;
  onCopy: (key: string) => void;
}): ReactElement {
  const request = props.request;
  const details = kv([
    ["标签", request.label],
    ["申请编号", h("span", { className: "mono" }, request.id)],
    ["全部数据权限", request.unrestricted_data ? "是" : "否"],
    ["site:write", request.site_write ? "允许" : "不允许"],
    ["状态", statusLabel(props.revealedKey === null ? request.status : "confirmed")],
    ["过期时间", `${formatTime(request.expires_at)}（${zoneLabel()}）`],
  ]);
  const chips = grantChips({
    sources: request.sources,
    siteWrite: request.site_write,
    unrestrictedData: request.unrestricted_data,
  });

  if (props.revealedKey !== null) {
    const key = props.revealedKey;
    const shown = `${key.slice(0, 10)}…`;
    return h(
      "section",
      { className: "page" },
      pageHead(
        "API Key · 第 2 步，共 2 步",
        "密钥已生成",
        "这是唯一一次看到原文。复制并保存到 Agent 的配置里，离开这一页之后不能再查看。",
        chip("已批准", "public"),
      ),
      message(props.message),
      h(
        "section",
        { className: "card glass-orbit key-card" },
        createElement(OrbitMark, { prefix: "key-mark", size: 72, animated: true }),
        h(
          "div",
          { className: "key-body" },
          h("div", { className: "kicker teal" }, `${request.label} · 只显示这一次`),
          h(
            "div",
            { className: "row key-row" },
            h("code", { className: "key mono" }, key),
            h(
              "button",
              {
                className: "btn btn-sm btn-glass",
                type: "button",
                onClick: () => {
                  props.onCopy(key);
                },
              },
              createElement(Icon, { name: "copy", size: 14 }),
              props.copied ? "已复制" : "复制",
            ),
          ),
          h("div", { className: "row chips" }, ...chips),
        ),
      ),
      h(
        "div",
        { className: "g2" },
        h(
          "section",
          { className: "card" },
          h(
            "div",
            { className: "card-h" },
            h("h3", null, "接入方式"),
            h("span", { className: "cap" }, "HTTP 请求头，二选一"),
          ),
          h(
            "pre",
            { className: "code" },
            h("span", { className: "c" }, "# Authorization 请求头"),
            `\ncurl ${props.origin}/pcp/v1/whoami \\\n  -H "Authorization: ApiKey ${shown}"\n\n`,
            h("span", { className: "c" }, "# 或者 X-Api-Key 请求头"),
            `\ncurl ${props.origin}/pcp/v1/whoami \\\n  -H "X-Api-Key: ${shown}"`,
          ),
        ),
        h(
          "section",
          { className: "card card-b" },
          h("div", { className: "kicker" }, "申请详情"),
          details,
        ),
      ),
    );
  }

  const canConfirm = request.status === "pending";
  return h(
    "form",
    {
      className: "page",
      onSubmit: (event: { preventDefault(): void }) => {
        event.preventDefault();
        if (canConfirm) props.onConfirm();
      },
    },
    pageHead(
      "API Key · 第 2 步，共 2 步",
      "批准 API Key",
      "确认后才生成密钥，原文只在确认后的这一页显示一次。",
      chip(
        statusLabel(request.status),
        canConfirm ? "pending" : request.status === "expired" ? "danger" : "",
      ),
    ),
    message(props.message),
    h(
      "div",
      { className: "g2" },
      h(
        "section",
        { className: "card card-b" },
        h("div", { className: "kicker" }, "申请详情"),
        details,
        h("div", { className: "row chips" }, ...chips),
        request.unrestricted_data ? null : grantRows(request.sources),
      ),
      canConfirm
        ? h(
            "aside",
            { className: "card card-b summary" },
            ReadGrantNotice(),
            h(
              "button",
              { className: "btn btn-lg btn-orbit wide", type: "submit", disabled: props.pending },
              "确认",
            ),
            h("p", { className: "cap" }, "生效后的密钥不能改权限；要改，就作废后重新批准一把。"),
          )
        : h(
            "aside",
            { className: "card card-b summary" },
            h("p", { className: "body-s" }, "这条申请已经不能批准。需要的话，请重新发起。"),
          ),
    ),
  );
}

export function SiteCreateView(props: {
  releaseId: string;
  message: string | null;
  pending: boolean;
  onReleaseId: (value: string) => void;
  onSubmit: () => void;
}): ReactElement {
  return h(
    "form",
    {
      className: "page",
      onSubmit: (event: { preventDefault(): void }) => {
        event.preventDefault();
        props.onSubmit();
      },
    },
    pageHead(
      "Site activation",
      "申请站点上线",
      "填写 public-page，或 rel_ 加 32 位十六进制。这一步不移动指针。",
    ),
    message(props.message),
    h(
      "section",
      { className: "card card-b narrow" },
      h(
        "label",
        { className: "field" },
        h("span", null, "release id"),
        h("input", {
          className: "input mono",
          type: "text",
          value: props.releaseId,
          placeholder: "public-page 或 rel_…",
          onChange: (event: { currentTarget: EventTarget | null }) => {
            props.onReleaseId(readInputValue(event.currentTarget));
          },
        }),
      ),
      h(
        "button",
        {
          className: "btn btn-orbit",
          type: "submit",
          disabled: props.pending || props.releaseId.trim() === "",
        },
        "发起批准",
      ),
      h("p", { className: "cap" }, "申请之后由你在批准页确认，线上指针才会移动。"),
    ),
  );
}

function releaseCaption(id: string): string {
  return id === "public-page" ? "内置首页" : "Agent 上传的 release";
}

export function SiteApprovalView(props: {
  activation: SiteActivation;
  currentPointer: string | null;
  now: number;
  message: string | null;
  pending: boolean;
  outcome: "approve" | "reject" | null;
  onDecide: (decision: "approve" | "reject") => void;
}): ReactElement {
  const activation = props.activation;
  const remaining = Date.parse(activation.expires_at) - props.now;
  const expired =
    activation.status === "expired" || (activation.status === "pending" && !(remaining > 0));
  const canDecide = activation.status === "pending" && !expired && props.outcome === null;
  const statusChip = canDecide
    ? chip(`待批准 · 剩余 ${formatRemaining(remaining)}`, "pending")
    : expired
      ? chip("已过期", "danger")
      : chip(
          statusLabel(
            props.outcome === "approve"
              ? "approved"
              : props.outcome === "reject"
                ? "rejected"
                : activation.status,
          ),
        );
  const preview = previewPath(activation.release_id);
  return h(
    "form",
    {
      className: "page",
      onSubmit: (event: { preventDefault(): void }) => {
        event.preventDefault();
        if (canDecide) props.onDecide("approve");
      },
    },
    pageHead(
      "Site activation",
      "批准站点上线",
      "只有确认才会移动指针。拒绝后线上路径保持不变。",
      statusChip,
    ),
    message(props.message),
    h(
      "section",
      { className: "card card-b pointer-card" },
      h(
        "div",
        { className: "ptr" },
        h("div", { className: "cap" }, "当前线上"),
        h(
          "div",
          { className: "mono ptr-id", title: props.currentPointer ?? undefined },
          props.currentPointer === null ? "读取失败" : shortRelease(props.currentPointer),
        ),
        h(
          "div",
          { className: "body-s" },
          props.currentPointer === null ? "没能读到当前指针" : releaseCaption(props.currentPointer),
        ),
      ),
      pointerArc(),
      h(
        "div",
        { className: "ptr ptr-to" },
        h("div", { className: "cap" }, "申请上线"),
        h(
          "div",
          { className: "mono ptr-id grad", title: activation.release_id },
          shortRelease(activation.release_id),
        ),
        h(
          "div",
          { className: "body-s" },
          `${releaseCaption(activation.release_id)} · 由持有 site:write 的凭据提交`,
        ),
      ),
    ),
    h(
      "div",
      { className: "g2" },
      h(
        "section",
        { className: "card" },
        h(
          "div",
          { className: "card-h" },
          h("h3", null, "预览"),
          h("span", { className: "cap mono" }, preview),
          h("span", { className: "sp" }),
          h(
            "a",
            { className: "btn btn-sm", href: preview, target: "_blank", rel: "noopener" },
            "新窗口打开",
            createElement(Icon, { name: "external", size: 14 }),
          ),
        ),
        h(
          "div",
          { className: "card-b" },
          h(
            "p",
            { className: "body-s" },
            "预览在新窗口里打开，不嵌进管理端：Agent 写的页面不在管理端的同源环境里运行。上线前请检查页面只展示公开字段，没有写死私有内容或密钥。",
          ),
        ),
      ),
      h(
        "aside",
        { className: "card card-b summary" },
        h("div", { className: "kicker" }, "申请详情"),
        kv([
          ["release", h("span", { className: "mono" }, activation.release_id)],
          ["申请编号", h("span", { className: "mono" }, activation.id)],
          ["过期时间", `${formatTime(activation.expires_at)}（${zoneLabel()}）`],
        ]),
        props.outcome === "approve"
          ? h("p", { className: "note info", role: "status" }, "已同意上线。")
          : null,
        props.outcome === "reject"
          ? h("p", { className: "note info", role: "status" }, "已拒绝。指针没有移动。")
          : null,
        expired && props.outcome === null
          ? h("p", { className: "body-s" }, "申请已过期，不能再批准。需要的话请让 Agent 重新申请。")
          : null,
        canDecide ? SiteReleaseNotice() : null,
        canDecide
          ? h(
              "div",
              { className: "row actions" },
              h(
                "button",
                { className: "btn btn-lg btn-orbit", type: "submit", disabled: props.pending },
                "确认",
              ),
              h(
                "button",
                {
                  className: "btn btn-lg btn-danger",
                  type: "button",
                  disabled: props.pending,
                  onClick: (event: { preventDefault(): void }) => {
                    event.preventDefault();
                    props.onDecide("reject");
                  },
                },
                "拒绝",
              ),
            )
          : null,
        h("p", { className: "cap" }, "回到旧 release 或 public-page，同样要重新申请并由你批准。"),
      ),
    ),
  );
}

export function StatusView(props: { title: string; message: string | null }): ReactElement {
  return h(
    "section",
    { className: "page status" },
    h("h1", null, props.title),
    props.message === null ? null : h("p", { className: "body-s", role: "status" }, props.message),
  );
}

function eventAsForm(event: { preventDefault(): void }): { login: string; password: string } {
  const current = (event as { currentTarget?: unknown }).currentTarget;
  if (typeof current !== "object" || current === null || !("elements" in current)) {
    return { login: "", password: "" };
  }
  const named = current as { elements: { namedItem(name: string): unknown } };
  return {
    login: controlValue(named.elements.namedItem("login")),
    password: controlValue(named.elements.namedItem("password")),
  };
}

function controlValue(control: unknown): string {
  if (typeof control !== "object" || control === null || !("value" in control)) return "";
  const value = (control as { value?: unknown }).value;
  return typeof value === "string" ? value : "";
}
