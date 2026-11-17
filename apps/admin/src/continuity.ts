import type { ReactElement } from "react";

import { h, formatTime } from "./parts";
import type { QueryPage, DeletedSource } from "./types";

export const PAGE_SIZE = 20;

export type RecordsTab = "directories" | "deleted" | "recent";

export function pageSlice<T>(items: readonly T[], page: number, limit = PAGE_SIZE): readonly T[] {
  const start = Math.max(0, page) * limit;
  return items.slice(start, start + limit);
}

export function hasNextPage(total: number, page: number, limit = PAGE_SIZE): boolean {
  return (page + 1) * limit < total;
}

export function connectCommand(origin: string): string {
  return `npx skills add ${origin} -a <agent> -s oneself -y`;
}

export const SKILL_UPDATE_NOTICE = "发现 oneself skill 有更新，请升级 skill";

export function skillUpgradeCommand(): string {
  return "npx skills update oneself";
}

export function skillDigestKey(origin: string): string {
  return `oneself.skill-digest.${origin}`;
}

export function skillTextKey(origin: string): string {
  return `oneself.skill-text.${origin}`;
}

export type SkillDiffLine = {
  readonly kind: "same" | "add" | "del";
  readonly text: string;
};

/** Line diff of two skill copies. Long unchanged runs collapse to one marker. */
export function skillLineDiff(before: string, after: string): readonly SkillDiffLine[] {
  const previous = before.split("\n");
  const next = after.split("\n");
  if (previous.length * next.length > 80_000) {
    return [
      { kind: "del", text: `上一份 ${String(previous.length)} 行` },
      { kind: "add", text: `当前 ${String(next.length)} 行` },
    ];
  }
  const score: number[][] = Array.from({ length: previous.length + 1 }, () =>
    Array<number>(next.length + 1).fill(0),
  );
  for (let i = previous.length - 1; i >= 0; i -= 1) {
    for (let j = next.length - 1; j >= 0; j -= 1) {
      const down = score[i + 1]?.[j] ?? 0;
      const right = score[i]?.[j + 1] ?? 0;
      const diagonal = score[i + 1]?.[j + 1] ?? 0;
      score[i][j] = previous[i] === next[j] ? diagonal + 1 : Math.max(down, right);
    }
  }
  const raw: SkillDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < previous.length && j < next.length) {
    if (previous[i] === next[j]) {
      raw.push({ kind: "same", text: previous[i] });
      i += 1;
      j += 1;
    } else if ((score[i + 1]?.[j] ?? 0) >= (score[i]?.[j + 1] ?? 0)) {
      raw.push({ kind: "del", text: previous[i] });
      i += 1;
    } else {
      raw.push({ kind: "add", text: next[j] });
      j += 1;
    }
  }
  while (i < previous.length) {
    raw.push({ kind: "del", text: previous[i] });
    i += 1;
  }
  while (j < next.length) {
    raw.push({ kind: "add", text: next[j] });
    j += 1;
  }
  return collapseSame(raw);
}

function collapseSame(lines: readonly SkillDiffLine[]): readonly SkillDiffLine[] {
  const out: SkillDiffLine[] = [];
  let same = 0;
  const flush = (keep: boolean): void => {
    if (same > 1) out.push({ kind: "same", text: "…" });
    else if (same === 1 && keep) out.push({ kind: "same", text: "" });
    same = 0;
  };
  for (const line of lines) {
    if (line.kind === "same") {
      same += 1;
      continue;
    }
    if (same === 1) out.push({ kind: "same", text: "" });
    else if (same > 1) out.push({ kind: "same", text: "…" });
    same = 0;
    out.push(line);
  }
  flush(false);
  return out.filter((line) => line.text !== "" || line.kind !== "same");
}

/** Remember the current text when the owner confirms, or when nothing has changed yet. */
export function skillSnapshotPlan(input: {
  readonly prompt: boolean;
  readonly current: string | null;
  readonly previous: string | null;
  readonly acknowledged: boolean;
}): string | null {
  if (input.current === null) return null;
  if (input.acknowledged) return input.current;
  if (!input.prompt && input.previous === null) return input.current;
  return null;
}

/** Prompt only an owner who already has an agent, and only until this digest is acknowledged. */
export function shouldPromptSkillUpdate(input: {
  readonly hasAgent: boolean;
  readonly digest: string | null;
  readonly stored: string | null;
}): boolean {
  return input.hasAgent && input.digest !== null && input.stored !== input.digest;
}

/**
 * Store silently when there is no agent, and store when the owner acknowledges.
 * Do not store while the notice is still waiting for that acknowledgement.
 */
export function skillNoticePlan(input: {
  readonly hasAgent: boolean;
  readonly digest: string | null;
  readonly stored: string | null;
  readonly acknowledged: boolean;
  readonly origin: string | null;
}): { readonly storeDigest: string | null; readonly prompt: boolean } {
  const prompt = input.acknowledged ? false : shouldPromptSkillUpdate(input);
  const store =
    input.digest !== null && input.origin !== null && (input.acknowledged || !input.hasAgent);
  return { storeDigest: store ? input.digest : null, prompt };
}

/**
 * Writes that follow `skillNoticePlan`.
 * A silent store keeps fetched skill text so a later diff has a baseline.
 * A null fetch must not replace text that is already stored.
 */
export function skillStorePlan(input: {
  readonly storeDigest: string | null;
  readonly hasAgent: boolean;
  readonly fetchedText: string | null;
}): { readonly digest: string | null; readonly text: string | null } {
  if (input.storeDigest === null) return { digest: null, text: null };
  if (input.hasAgent || input.fetchedText === null) {
    return { digest: input.storeDigest, text: null };
  }
  return { digest: input.storeDigest, text: input.fetchedText };
}

/** Next query/deleted-source cursor. A full page is not the total. */
function nextCursor(offset: number, pageLength: number, limit = PAGE_SIZE): string | null {
  if (pageLength < limit) return null;
  return String(offset + limit);
}

/** Fetch the next page only when this page is full. A short page does not request another. */
export function requestNextPage(
  offset: number,
  pageLength: number,
  load: (cursor: number) => void,
): void {
  const cursor = nextCursor(offset, pageLength);
  if (cursor !== null) load(Number(cursor));
}

export function queryBody(cursor: string | undefined): { limit: number; cursor?: string } {
  return cursor === undefined ? { limit: PAGE_SIZE } : { limit: PAGE_SIZE, cursor };
}

type Arm = {
  readonly armed: boolean;
  readonly pending: boolean;
  readonly onArm: () => void;
  readonly onConfirm: () => void;
  readonly label: string;
  readonly confirm: string;
};

function confirmButton(input: Arm): ReactElement {
  if (!input.armed) {
    return h(
      "button",
      {
        className: "btn btn-sm btn-danger",
        type: "button",
        disabled: input.pending,
        onClick: input.onArm,
      },
      input.label,
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
        onClick: input.onConfirm,
      },
      input.confirm,
    ),
    h(
      "button",
      {
        className: "btn btn-sm btn-ghost",
        type: "button",
        disabled: input.pending,
        onClick: input.onArm,
      },
      "取消",
    ),
  );
}

export function directoryActions(input: {
  readonly id: string;
  readonly armed: boolean;
  readonly pending: boolean;
  readonly onArm: (id: string | null) => void;
  readonly onDelete: (id: string) => void;
}): ReactElement {
  return confirmButton({
    armed: input.armed,
    pending: input.pending,
    label: "删除",
    confirm: "确认删除",
    onArm: () => {
      input.onArm(input.armed ? null : input.id);
    },
    onConfirm: () => {
      input.onDelete(input.id);
    },
  });
}

function restoreActions(input: {
  readonly id: string;
  readonly armed: boolean;
  readonly pending: boolean;
  readonly onArm: (id: string | null) => void;
  readonly onRestore: (id: string) => void;
}): ReactElement {
  return confirmButton({
    armed: input.armed,
    pending: input.pending,
    label: "恢复",
    confirm: "确认恢复",
    onArm: () => {
      input.onArm(input.armed ? null : input.id);
    },
    onConfirm: () => {
      input.onRestore(input.id);
    },
  });
}

export function recentRows(pages: readonly QueryPage[]): ReactElement {
  return h(
    "ul",
    { className: "list" },
    ...pages.map((page) =>
      h(
        "li",
        { key: `${page.source}/${page.slug}`, className: "li" },
        h(
          "div",
          { className: "li-main" },
          h("div", { className: "t" }, page.title),
          h(
            "div",
            { className: "s" },
            `${page.source} / ${page.slug} · ${page.type} · ${formatTime(page.updated_at)}`,
          ),
        ),
      ),
    ),
  );
}

export function deletedRows(
  rows: readonly DeletedSource[],
  armed: string | null,
  pending: boolean,
  onArm: (id: string | null) => void,
  onRestore: (id: string) => void,
): ReactElement {
  return h(
    "ul",
    { className: "list" },
    ...rows.map((row) =>
      h(
        "li",
        { key: row.id, className: "li" },
        h(
          "div",
          { className: "li-main" },
          h("div", { className: "t" }, row.id),
          h("div", { className: "s" }, `删除于 ${formatTime(row.deleted_at)}`),
        ),
        restoreActions({
          id: row.id,
          armed: armed === row.id,
          pending,
          onArm,
          onRestore,
        }),
      ),
    ),
  );
}

export function pageControls(input: {
  readonly page: number;
  readonly hasNext: boolean;
  readonly onPage: (page: number) => void;
}): ReactElement {
  const prevDisabled = input.page <= 0;
  const nextDisabled = !input.hasNext;
  return h(
    "nav",
    { className: "pager", "aria-label": "分页" },
    h(
      "button",
      {
        className: "btn btn-sm btn-ghost",
        type: "button",
        disabled: prevDisabled,
        onClick: () => {
          if (!prevDisabled) input.onPage(input.page - 1);
        },
      },
      "上一页",
    ),
    h("span", { className: "cap" }, `第 ${String(input.page + 1)} 页`),
    h(
      "button",
      {
        className: "btn btn-sm btn-ghost",
        type: "button",
        disabled: nextDisabled,
        onClick: () => {
          if (!nextDisabled) input.onPage(input.page + 1);
        },
      },
      "下一页",
    ),
  );
}
