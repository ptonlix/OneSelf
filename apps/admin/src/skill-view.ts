import { useEffect, useState, type ReactElement } from "react";

import {
  readStoredSkillDigest,
  readStoredSkillText,
  writeClipboard,
  writeStoredSkillDigest,
  writeStoredSkillText,
} from "./browser";
import {
  SKILL_UPDATE_NOTICE,
  connectCommand,
  skillLineDiff,
  skillNoticePlan,
  skillSnapshotPlan,
  skillStorePlan,
  skillUpgradeCommand,
  type SkillDiffLine,
} from "./continuity";
import type { AdminClient } from "./http";
import { Icon } from "./icons";
import { h, pageHead } from "./parts";

export function SkillScreen(props: {
  client: AdminClient;
  onFailure: (reason: unknown) => string;
  onAcknowledged: () => void;
}): ReactElement {
  const [origin, setOrigin] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const [copied, setCopied] = useState<"install" | "update" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const [nextOrigin, keys, grants, text, nextDigest] = await Promise.all([
          props.client.readConnectOrigin(),
          props.client.listApiKeys(),
          props.client.listOauthGrants(),
          props.client.readSkillText(),
          props.client.readSkillDigest(),
        ]);
        if (cancelled) return;
        const hasAgent =
          keys.some((key) => key.revoked_at === null) ||
          grants.some((grant) => grant.revoked_at === null);
        const stored = readStoredSkillDigest(nextOrigin);
        const storedText = readStoredSkillText(nextOrigin);
        const plan = skillNoticePlan({
          hasAgent,
          digest: nextDigest,
          stored,
          acknowledged: false,
          origin: nextOrigin,
        });
        const snapshot = skillSnapshotPlan({
          prompt: plan.prompt,
          current: text,
          previous: storedText,
          acknowledged: false,
        });
        const writes = skillStorePlan({
          storeDigest: plan.storeDigest,
          hasAgent,
          fetchedText: hasAgent ? null : text,
        });
        try {
          if (writes.digest !== null) writeStoredSkillDigest(nextOrigin, writes.digest);
          if (writes.text !== null) writeStoredSkillText(nextOrigin, writes.text);
          else if (snapshot !== null) writeStoredSkillText(nextOrigin, snapshot);
        } catch {
          // A full or denied store must not blank the skill page.
        }
        setOrigin(nextOrigin);
        setMarkdown(text);
        setPrevious(storedText);
        setDigest(nextDigest);
        setUpdated(plan.prompt);
      } catch (reason: unknown) {
        if (!cancelled) setError(props.onFailure(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [props.client, props.onFailure]);

  return SkillPage({
    origin,
    markdown,
    previous,
    loading,
    error,
    updated,
    copied,
    onCopy: (kind) => {
      if (origin === null) return;
      void copySkillCommand(origin, kind).then((ok) => {
        if (ok) setCopied(kind);
      });
    },
    onAck: () => {
      if (origin !== null && digest !== null) writeStoredSkillDigest(origin, digest);
      if (origin !== null && markdown !== null) writeStoredSkillText(origin, markdown);
      setUpdated(false);
      setPrevious(markdown);
      props.onAcknowledged();
    },
  });
}

export function SkillPage(props: {
  readonly origin: string | null;
  readonly markdown: string | null;
  readonly previous: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly updated: boolean;
  readonly copied: "install" | "update" | null;
  readonly onCopy: (kind: "install" | "update") => void;
  readonly onAck: () => void;
}): ReactElement {
  const diff =
    props.previous !== null && props.markdown !== null && props.previous !== props.markdown
      ? skillLineDiff(props.previous, props.markdown)
      : null;
  return h(
    "section",
    { className: "page skill-page" },
    pageHead("产品", "Skill", "查看当前 oneself，并对比上一份已确认的正文。"),
    props.loading ? h("p", { className: "body-s", role: "status" }, "正在读取…") : null,
    props.error !== null ? h("p", { className: "note danger", role: "alert" }, props.error) : null,
    h(
      "section",
      { className: "card", "aria-label": props.updated ? "升级 skill" : "Skill 命令" },
      props.updated ? h("div", { className: "card-h" }, h("h3", null, SKILL_UPDATE_NOTICE)) : null,
      h("div", { className: "card-b" }, commandBlock(props)),
    ),
    h(
      "section",
      { className: "card", "aria-label": "Skill 改动" },
      h("div", { className: "card-h" }, h("h3", null, "本次改动")),
      h("div", { className: "card-b" }, diffBody(props.previous, props.markdown, diff)),
    ),
    h(
      "section",
      { className: "card", "aria-label": "当前 skill" },
      h("div", { className: "card-h" }, h("h3", null, "当前 Skill")),
      h(
        "pre",
        { className: "skill-current" },
        props.markdown ?? (props.loading ? "" : "还没有读到 Skill。"),
      ),
    ),
  );
}

function commandBlock(props: {
  readonly origin: string | null;
  readonly updated: boolean;
  readonly copied: "install" | "update" | null;
  readonly onCopy: (kind: "install" | "update") => void;
  readonly onAck: () => void;
}): ReactElement {
  const origin = props.origin ?? "";
  return h(
    "div",
    { className: "skill-commands" },
    commandRow("全新安装", connectCommand(origin), "复制安装", props.copied === "install", () => {
      props.onCopy("install");
    }),
    commandRow("已安装升级", skillUpgradeCommand(), "复制升级", props.copied === "update", () => {
      props.onCopy("update");
    }),
    props.updated
      ? h("button", { type: "button", className: "skill-ack", onClick: props.onAck }, "已更新")
      : null,
  );
}

function commandRow(
  label: string,
  command: string,
  copyLabel: string,
  copied: boolean,
  onCopy: () => void,
): ReactElement {
  return h(
    "div",
    { className: "skill-cmd" },
    h("span", { className: "kicker" }, label),
    h("code", null, command),
    h(
      "button",
      {
        type: "button",
        className: "skill-copy",
        "aria-label": copied ? `已${copyLabel}` : copyLabel,
        onClick: onCopy,
      },
      Icon({ name: "copy", size: 14 }),
    ),
  );
}

function diffBody(
  previous: string | null,
  markdown: string | null,
  diff: readonly SkillDiffLine[] | null,
): ReactElement {
  if (markdown === null) return h("p", { className: "body-s" }, "读到当前 Skill 后才能对比。");
  if (previous === null) {
    return h("p", { className: "body-s" }, "还没有上一份。确认后会记住这一份，下次更新才能对比。");
  }
  if (previous === markdown) return h("p", { className: "body-s" }, "和已确认的一份相同。");
  return h(
    "pre",
    { className: "skill-diff" },
    ...(diff ?? []).map((line, index) =>
      h(
        "span",
        { key: String(index), className: `diff-${line.kind}` },
        `${line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "} ${line.text}\n`,
      ),
    ),
  );
}

export async function copySkillCommand(
  origin: string,
  kind: "install" | "update",
): Promise<boolean> {
  const command = kind === "install" ? connectCommand(origin) : skillUpgradeCommand();
  return writeClipboard(command);
}
