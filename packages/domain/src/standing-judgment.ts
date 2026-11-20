import { timestampMs } from "./clock.ts";
import type { PageProjection } from "./markdown.ts";
import { fail, ok, type DomainResult } from "./result.ts";

export const SELF_SOURCE = "self";
export const SELF_SOUL_SLUG = "soul";
export const SELF_RECENT_SLUG = "recent";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isReservedSelfPage(source: string, slug: string): boolean {
  return source === SELF_SOURCE && (slug === SELF_SOUL_SLUG || slug === SELF_RECENT_SLUG);
}

export function standingSeed(slug: string, now: string): DomainResult<string> {
  const asOf = calendarDate(now);
  if (asOf === null) {
    return fail("invalid", "invalid timestamp");
  }
  if (slug === SELF_SOUL_SLUG) {
    return ok(soulSeed());
  }
  if (slug === SELF_RECENT_SLUG) {
    return ok(recentSeed(asOf));
  }
  return fail("invalid", "page identity is invalid");
}

export function assertStandingContract(
  source: string,
  slug: string,
  projection: PageProjection,
): DomainResult<null> {
  if (!isReservedSelfPage(source, slug)) {
    return ok(null);
  }
  if (slug === SELF_SOUL_SLUG) {
    if (projection.type !== "soul") {
      return fail("invalid", "self/soul type must be soul");
    }
    if (typeof projection.frontmatter["name"] !== "string") {
      return fail("invalid", "self/soul field contract is not met");
    }
    return ok(null);
  }
  if (projection.type !== "recent") {
    return fail("invalid", "self/recent type must be recent");
  }
  const asOf = projection.frontmatter["as_of"];
  if (typeof asOf !== "string" || !isCalendarDate(asOf)) {
    return fail("invalid", "self/recent field contract is not met");
  }
  return ok(null);
}

export function rejectStandingStructureWrite(source: string, slug: string): DomainResult<null> {
  if (isReservedSelfPage(source, slug)) {
    return fail("invalid", "portrait pages cannot use fact or timeline rewrites");
  }
  return ok(null);
}

function soulSeed(): string {
  return `---
type: soul
title: 灵魂画像
name: ""
visibility: private
tags: []
files: []
---

# Soul — 长期个人认知

这份文件描述一个人的长期内在特征。
它不是简历、个人介绍，也不是 Agent 的行为指令。

只记录经过证据支持的长期判断。
不确定的内容不进入正式画像。

## 01. Values — 价值观与信念

## 02. Thinking — 思维与认知

## 03. Operating — 做事与决策

## 04. Habits — 习惯与行为规律

## 05. Motivations — 内在动机

## 06. Strengths & Frictions — 优势与摩擦

## Timeline — 认知演化

只记录重要认知的建立、修正与失效。

## Observations — 候选观察

记录尚未充分确认的潜在规律。不能当作已经确认的特征。
`;
}

function recentSeed(asOf: string): string {
  return `---
type: recent
title: 近期画像
as_of: ${asOf}
visibility: private
tags: []
files: []
---

# Recent — 近期生活

记录最近一段时间仍有理解价值的生活状态。
不做流水账。过期的判断退出栏目。

## 01. Focus — 近期关注

## 02. Work — 工作与事业

## 03. Mood — 情绪与心理状态

## 04. Health — 身体与健康

## 05. Life — 生活状态

## 06. Relationships — 人际关系

## 07. Goals & Challenges — 目标与困扰

## Facts — 近期有效判断

## Timeline — 近期重要变化
`;
}

function calendarDate(now: string): string | null {
  if (timestampMs(now) === null) {
    return null;
  }
  const date = now.slice(0, 10);
  return isCalendarDate(date) ? date : null;
}

function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
