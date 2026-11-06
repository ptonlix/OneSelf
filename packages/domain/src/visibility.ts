import { splitFrontmatter } from "./frontmatter.ts";
import { projectMarkdown, type Visibility } from "./markdown.ts";
import { fail, ok, type DomainResult } from "./result.ts";

/**
 * Rewrites only the top-level visibility line. `null` means the page is already
 * that visibility, including an omitted line when the target is private.
 * The returned string keeps the body bytes after the frontmatter fence.
 */
export function setPageVisibility(
  markdown: string,
  visibility: Visibility,
): DomainResult<string | null> {
  const projected = projectMarkdown(markdown);
  if (!projected.ok) {
    return projected;
  }
  if (projected.value.visibility === visibility) {
    return ok(null);
  }
  const split = splitFrontmatter(markdown);
  if (split === null) {
    return fail("invalid", "frontmatter is required");
  }
  const newline = frontmatterNewline(markdown);
  const lines = split.yaml.split(/\r?\n/);
  const index = lines.findIndex((line) => /^visibility:/.test(line));
  const nextLines =
    index === -1
      ? [...lines, `visibility: ${visibility}`]
      : lines.map((line, lineIndex) =>
          lineIndex === index ? `visibility: ${visibility}` : line,
        );
  const open = markdown.startsWith("---\r\n") ? "---\r\n" : "---\n";
  const yamlStart = open.length;
  const yamlEnd = yamlStart + split.yaml.length;
  const next = `${markdown.slice(0, yamlStart)}${nextLines.join(newline)}${markdown.slice(yamlEnd)}`;
  const checked = projectMarkdown(next);
  if (!checked.ok) {
    return checked;
  }
  if (checked.value.visibility !== visibility) {
    return fail("invalid", "visibility was not written");
  }
  if (!sameBody(next, split.body)) {
    return fail("invalid", "body changed");
  }
  return ok(next);
}

function frontmatterNewline(markdown: string): "\n" | "\r\n" {
  return markdown.startsWith("---\r\n") ? "\r\n" : "\n";
}

function sameBody(markdown: string, body: string): boolean {
  return markdown.slice(markdown.length - body.length) === body;
}
