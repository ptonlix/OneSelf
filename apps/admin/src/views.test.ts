import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { READ_GRANT_NOTICE } from "./copy";
import type { ApiKeyRequest, SiteActivation, SourceDraft } from "./types";
import { ApiKeyApprovalView, DeviceApprovalView, SiteApprovalView } from "./views";

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

function html(node: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(node);
}

function expectNoticeBeforeConfirm(markup: string): void {
  const noticeAt = markup.indexOf(notice);
  const confirmAt = markup.indexOf(">确认<");
  expect(noticeAt).toBeGreaterThanOrEqual(0);
  expect(confirmAt).toBeGreaterThan(noticeAt);
}

describe("approval pages", () => {
  it("uses the required private-page sentence", () => {
    expect(READ_GRANT_NOTICE).toBe(notice);
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
        onConfirm: () => undefined,
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
        onConfirm: () => undefined,
      }),
    );
    expect(after.indexOf(">确认<")).toBe(-1);
    expect(after).toContain("osk_once");
    expect(after).toContain("只显示这一次");
  });

  it("puts the sentence before site confirmation", () => {
    const markup = html(
      createElement(SiteApprovalView, {
        activation,
        message: null,
        pending: false,
        outcome: null,
        onDecide: () => undefined,
      }),
    );
    expectNoticeBeforeConfirm(markup);
    expect(markup.indexOf(">拒绝<")).toBeGreaterThan(markup.indexOf(">确认<"));
  });
});
