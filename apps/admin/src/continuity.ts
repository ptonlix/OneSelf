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
