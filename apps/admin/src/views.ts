import { createElement, type ReactElement, type ReactNode } from "react";
import { readInputChecked, readInputValue } from "./browser";
import { READ_GRANT_NOTICE } from "./copy";
import { hrefFor, type AdminRoute } from "./routes";
import type { ApiKeyRequest, GrantFlag, SiteActivation, SourceDraft } from "./types";

interface ElementProps {
  className?: string;
  href?: string;
  type?: "button" | "submit" | "text" | "password" | "checkbox";
  name?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  role?: string;
  key?: string;
  onClick?: (event: { preventDefault(): void }) => void;
  onSubmit?: (event: { preventDefault(): void }) => void;
  onChange?: (event: { currentTarget: EventTarget | null }) => void;
}

function h(tag: string, props: ElementProps | null, ...children: ReactNode[]): ReactElement {
  return createElement(tag, props, ...children);
}

function yesNo(value: boolean): string {
  return value ? "是" : "否";
}

function ReadGrantNotice(): ReactElement {
  return h("p", { className: "notice" }, READ_GRANT_NOTICE);
}

export function Shell(props: {
  showNav: boolean;
  onNavigate: (route: AdminRoute) => void;
  onLogout: () => void;
  children: ReactNode;
}): ReactElement {
  return h(
    "main",
    { className: "shell" },
    props.showNav
      ? h(
          "nav",
          null,
          link("首页", { name: "home" }, props.onNavigate),
          link("设备码", { name: "device", userCode: "" }, props.onNavigate),
          link("API Key", { name: "api-key-new" }, props.onNavigate),
          link("站点", { name: "site-new" }, props.onNavigate),
          link("改密", { name: "password" }, props.onNavigate),
          h(
            "button",
            {
              className: "link",
              type: "button",
              onClick: (event) => {
                event.preventDefault();
                props.onLogout();
              },
            },
            "登出",
          ),
        )
      : null,
    h("div", { className: "card" }, props.children),
  );
}

export function LoginView(props: {
  message: string | null;
  pending: boolean;
  onSubmit: (login: string, password: string) => void;
  onLogout: (() => void) | null;
}): ReactElement {
  return h(
    "form",
    {
      className: "stack",
      onSubmit: (event) => {
        event.preventDefault();
        const form = eventAsForm(event);
        props.onSubmit(form.login, form.password);
      },
    },
    h("h1", null, "登录"),
    h("p", { className: "muted" }, "使用所属人登录名。改密完成前，其他管理操作不会打开。"),
    message(props.message),
    h(
      "label",
      null,
      "登录名",
      h("input", { name: "login", type: "text", autoComplete: "username" }),
    ),
    h(
      "label",
      null,
      "密码",
      h("input", { name: "password", type: "password", autoComplete: "current-password" }),
    ),
    h("button", { className: "primary", type: "submit", disabled: props.pending }, "登录"),
    props.onLogout === null
      ? null
      : h(
          "button",
          {
            className: "secondary",
            type: "button",
            onClick: () => {
              props.onLogout?.();
            },
          },
          "登出",
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
  return h(
    "form",
    {
      className: "stack",
      onSubmit: (event) => {
        event.preventDefault();
        props.onSubmit(eventAsForm(event).password);
      },
    },
    h("h1", null, "修改密码"),
    h(
      "p",
      { className: "muted" },
      props.locked ? "必须先改密。在此之前只能留在这一页或登出。" : "新密码会替换当前所属人密码。",
    ),
    message(props.message),
    h(
      "label",
      null,
      "新密码",
      h("input", { name: "password", type: "password", autoComplete: "new-password" }),
    ),
    h("button", { className: "primary", type: "submit", disabled: props.pending }, "保存密码"),
    h(
      "button",
      {
        className: "secondary",
        type: "button",
        onClick: (event) => {
          event.preventDefault();
          props.onLogout();
        },
      },
      "登出",
    ),
  );
}

export function HomeView(props: { onNavigate: (route: AdminRoute) => void }): ReactElement {
  return h(
    "section",
    { className: "stack" },
    h("h1", null, "管理"),
    h("p", null, "批准设备码、API Key 和站点上线。密钥原文只在确认后出现一次。"),
    h(
      "div",
      { className: "actions" },
      link("批准设备码", { name: "device", userCode: "" }, props.onNavigate),
      link("发起 API Key", { name: "api-key-new" }, props.onNavigate),
      link("申请站点上线", { name: "site-new" }, props.onNavigate),
    ),
  );
}

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
      { className: "stack" },
      h("h1", null, "设备码已批准"),
      h("p", null, "已批准这台设备。没有创建 API Key。"),
    );
  }
  return h(
    "form",
    {
      className: "stack",
      onSubmit: (event) => {
        event.preventDefault();
        props.onSubmit();
      },
    },
    h("h1", null, "批准设备码"),
    h(
      "p",
      { className: "muted" },
      "只保存这一页勾选的 source 三档和可选的 site:write。不创建 API Key，也没有全部数据权限。",
    ),
    message(props.message),
    h(
      "label",
      null,
      "用户码",
      h("input", {
        name: "user_code",
        type: "text",
        value: props.userCode,
        onChange: (event) => {
          props.onUserCode(readInputValue(event.currentTarget));
        },
      }),
    ),
    h(
      "label",
      { className: "check" },
      h("input", {
        type: "checkbox",
        checked: props.siteWrite,
        onChange: (event) => {
          props.onSiteWrite(readInputChecked(event.currentTarget));
        },
      }),
      "允许 site:write",
    ),
    sourceFields(props.drafts, false, props.onToggle),
    ReadGrantNotice(),
    h(
      "button",
      {
        className: "primary",
        type: "submit",
        disabled: props.pending || !props.directoriesReady || props.userCode.trim() === "",
      },
      "确认",
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
  return h(
    "form",
    {
      className: "stack",
      onSubmit: (event) => {
        event.preventDefault();
        props.onSubmit();
      },
    },
    h("h1", null, "发起 API Key"),
    h("p", { className: "muted" }, "这里只创建待批准申请，不生成密钥。"),
    message(props.message),
    h(
      "label",
      null,
      "标签",
      h("input", {
        type: "text",
        value: props.label,
        onChange: (event) => {
          props.onLabel(readInputValue(event.currentTarget));
        },
      }),
    ),
    h(
      "label",
      { className: "check" },
      h("input", {
        type: "checkbox",
        checked: props.unrestrictedData,
        onChange: (event) => {
          props.onUnrestricted(readInputChecked(event.currentTarget));
        },
      }),
      "全部数据权限，包含以后新建的目录",
    ),
    h(
      "label",
      { className: "check" },
      h("input", {
        type: "checkbox",
        checked: props.siteWrite,
        onChange: (event) => {
          props.onSiteWrite(readInputChecked(event.currentTarget));
        },
      }),
      "允许 site:write",
    ),
    props.unrestrictedData
      ? h("p", { className: "muted" }, "已选择全部数据权限，目录列表不会写入申请。")
      : sourceFields(props.drafts, false, props.onToggle),
    h(
      "button",
      {
        className: "primary",
        type: "submit",
        disabled: props.pending || !props.directoriesReady || props.label.trim() === "",
      },
      "发起批准",
    ),
  );
}

export function ApiKeyApprovalView(props: {
  request: ApiKeyRequest;
  message: string | null;
  pending: boolean;
  revealedKey: string | null;
  onConfirm: () => void;
}): ReactElement {
  const canConfirm = props.request.status === "pending" && props.revealedKey === null;
  return h(
    "form",
    {
      className: "stack",
      onSubmit: (event) => {
        event.preventDefault();
        if (canConfirm) props.onConfirm();
      },
    },
    h("h1", null, "批准 API Key"),
    message(props.message),
    h("p", null, `标签：${props.request.label}`),
    h("p", null, `全部数据权限：${yesNo(props.request.unrestricted_data)}`),
    h("p", null, `site:write：${yesNo(props.request.site_write)}`),
    h("p", null, `状态：${props.request.status}`),
    h("p", null, `过期时间：${props.request.expires_at}`),
    grantList(props.request.sources),
    props.revealedKey === null
      ? null
      : h(
          "section",
          { className: "stack" },
          h("h2", null, "密钥原文只显示这一次"),
          h("p", null, "离开这一页之后不能再查看原文。"),
          h("code", { className: "key" }, props.revealedKey),
        ),
    canConfirm ? ReadGrantNotice() : null,
    canConfirm
      ? h("button", { className: "primary", type: "submit", disabled: props.pending }, "确认")
      : null,
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
      className: "stack",
      onSubmit: (event) => {
        event.preventDefault();
        props.onSubmit();
      },
    },
    h("h1", null, "申请站点上线"),
    h("p", { className: "muted" }, "填写 original，或 rel_ 加 32 位十六进制。这一步不移动指针。"),
    message(props.message),
    h(
      "label",
      null,
      "release id",
      h("input", {
        type: "text",
        value: props.releaseId,
        onChange: (event) => {
          props.onReleaseId(readInputValue(event.currentTarget));
        },
      }),
    ),
    h(
      "button",
      {
        className: "primary",
        type: "submit",
        disabled: props.pending || props.releaseId.trim() === "",
      },
      "发起批准",
    ),
  );
}

export function SiteApprovalView(props: {
  activation: SiteActivation;
  message: string | null;
  pending: boolean;
  outcome: "approve" | "reject" | null;
  onDecide: (decision: "approve" | "reject") => void;
}): ReactElement {
  const canDecide = props.activation.status === "pending" && props.outcome === null;
  return h(
    "form",
    {
      className: "stack",
      onSubmit: (event) => {
        event.preventDefault();
        if (canDecide) props.onDecide("approve");
      },
    },
    h("h1", null, "批准站点上线"),
    h("p", { className: "muted" }, "只有确认才会移动指针。拒绝后线上路径保持不变。"),
    message(props.message),
    h("p", null, `release：${props.activation.release_id}`),
    h("p", null, `状态：${props.activation.status}`),
    h("p", null, `过期时间：${props.activation.expires_at}`),
    props.outcome === "approve" ? h("p", null, "已同意上线。") : null,
    props.outcome === "reject" ? h("p", null, "已拒绝。指针没有移动。") : null,
    canDecide ? ReadGrantNotice() : null,
    canDecide
      ? h(
          "div",
          { className: "actions" },
          h("button", { className: "primary", type: "submit", disabled: props.pending }, "确认"),
          h(
            "button",
            {
              className: "secondary",
              type: "button",
              disabled: props.pending,
              onClick: (event) => {
                event.preventDefault();
                props.onDecide("reject");
              },
            },
            "拒绝",
          ),
        )
      : null,
  );
}

export function StatusView(props: { title: string; message: string | null }): ReactElement {
  return h("section", { className: "stack" }, h("h1", null, props.title), message(props.message));
}

function sourceFields(
  drafts: readonly SourceDraft[],
  disabled: boolean,
  onToggle: (id: string, flag: GrantFlag, value: boolean) => void,
): ReactElement {
  if (drafts.length === 0) return h("p", null, "还没有可授权的目录。");
  return h(
    "div",
    { className: "stack" },
    ...drafts.map((draft) =>
      h(
        "fieldset",
        { key: draft.id, disabled },
        h("legend", null, draft.id),
        flagBox(draft, "read", "读", onToggle),
        flagBox(draft, "write", "写", onToggle),
        flagBox(draft, "visibility", "改可见性", onToggle),
      ),
    ),
  );
}

function flagBox(
  draft: SourceDraft,
  flag: GrantFlag,
  label: string,
  onToggle: (id: string, flag: GrantFlag, value: boolean) => void,
): ReactElement {
  return h(
    "label",
    { className: "check" },
    h("input", {
      type: "checkbox",
      checked: draft[flag],
      onChange: (event) => {
        onToggle(draft.id, flag, readInputChecked(event.currentTarget));
      },
    }),
    label,
  );
}

function grantList(grants: SourceDraft[]): ReactElement {
  if (grants.length === 0) return h("p", null, "没有单独列出的目录。");
  return h(
    "ul",
    null,
    ...grants.map((grant) =>
      h(
        "li",
        { key: grant.id },
        `${grant.id}：读 ${yesNo(grant.read)}，写 ${yesNo(grant.write)}，改可见性 ${yesNo(grant.visibility)}`,
      ),
    ),
  );
}

function message(text: string | null): ReactElement | null {
  if (text === null || text === "") return null;
  return h("p", { className: "alert", role: "alert" }, text);
}

function link(
  text: string,
  route: AdminRoute,
  onNavigate: (route: AdminRoute) => void,
): ReactElement {
  return h(
    "a",
    {
      href: hrefFor(route),
      onClick: (event) => {
        event.preventDefault();
        onNavigate(route);
      },
    },
    text,
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
