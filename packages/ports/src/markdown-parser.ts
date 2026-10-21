/**
 * Splits a Markdown page into frontmatter and body, and reads the only two
 * structured fences: `## Facts` and `## Timeline`.
 * Permissions, slug shape, and visibility are not decided here.
 */
export interface MarkdownParser {
  /**
   * `markdown` is the decoded UTF-8 page, including its frontmatter block.
   * Failure to split that block, or to parse either fence, returns `ok: false`
   * and no document. There is no partial projection on failure.
   */
  parse(markdown: string): MarkdownParseResult;
}

export type MarkdownParseResult = MarkdownParseSuccess | MarkdownParseFailure;

export interface MarkdownParseSuccess {
  readonly ok: true;
  readonly document: ParsedMarkdown;
}

export interface MarkdownParseFailure {
  readonly ok: false;
  readonly message: string;
}

/**
 * `body` is everything after the frontmatter block.
 * It still contains the `## Facts` and `## Timeline` source.
 * `facts` and `timeline` are that source read in document order.
 * Sections that are absent are empty arrays, which is success.
 * Other headings stay ordinary body text and do not add facts or timeline rows.
 */
export interface ParsedMarkdown {
  readonly frontmatter: Frontmatter;
  readonly body: string;
  readonly facts: readonly ParsedFact[];
  readonly timeline: readonly ParsedTimelineEntry[];
}

/** JSON object stored as frontmatter. Required keys are checked by the caller. */
export interface Frontmatter {
  readonly [key: string]: JsonValue;
}

export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * One `## Facts` item.
 * `id`, `entity`, and `statement` are required for a successful parse.
 * `confidence` is a number from 0 to 1, or null when the item omits it.
 * `validUntil` is `YYYY-MM-DD`, or null when the item omits `valid_until`.
 */
export interface ParsedFact {
  readonly id: string;
  readonly entity: string;
  readonly statement: string;
  readonly confidence: number | null;
  readonly validUntil: string | null;
}

/**
 * One `## Timeline` line, `date | title | detail`.
 * `occurredOn` is the date as `YYYY-MM-DD`.
 * `detail` is null when the supplement is absent.
 */
export interface ParsedTimelineEntry {
  readonly occurredOn: string;
  readonly title: string;
  readonly detail: string | null;
}
