import { z } from "zod";

const sourceName = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const grant = z.object({
  id: sourceName,
  read: z.boolean(),
  write: z.boolean(),
  visibility: z.boolean(),
});
const limit = z.number().int().min(1).max(50).optional();
const cursor = z.string().regex(/^\d+$/).optional();

export const operationSchemas = {
  put_page: z.object({
    source: sourceName,
    slug,
    markdown: z.string(),
    hash: z.string().optional(),
  }),
  edit_page: z.object({
    source: sourceName,
    slug,
    hash: z.string(),
    edits: z.array(z.object({ search: z.string(), replace: z.string() })).min(1),
  }),
  put_pages: z.object({
    pages: z.array(
      z.object({
        source: sourceName,
        slug,
        markdown: z.string(),
        hash: z.string().optional(),
      }),
    ),
  }),
  get_page: z.object({ source: sourceName, slug }),
  list_pages: z.object({
    source: sourceName.optional(),
    type: z.string().optional(),
    prefix: z.string().optional(),
  }),
  delete_page: z.object({ source: sourceName, slug }),
  restore_page: z.object({ source: sourceName, slug }),
  get_versions: z.object({ source: sourceName, slug }),
  revert_version: z.object({ source: sourceName, slug, hash: z.string() }),
  resolve_slugs: z.object({ slugs: z.array(z.object({ source: sourceName, slug })) }),
  file_upload: z.object({
    data_base64: z.string().optional(),
    media_type: z.string().optional(),
  }),
  file_list: z.object({ source: sourceName.optional(), slug: slug.optional() }),
  file_url: z.object({ id: z.string() }),
  search: z.object({
    q: z.string().min(1),
    source: sourceName.optional(),
    limit,
    cursor,
  }),
  query: z.object({
    source: sourceName.optional(),
    type: z.string().optional(),
    tag: z.string().optional(),
    updated_after: z.string().optional(),
    updated_before: z.string().optional(),
    limit,
    cursor,
  }),
  add_tag: z.object({ source: sourceName, slug, tag: z.string().min(1) }),
  remove_tag: z.object({ source: sourceName, slug, tag: z.string().min(1) }),
  get_tags: z.object({ source: sourceName, slug }),
  add_link: z.object({
    from: z.object({ source: sourceName, slug }),
    to: z.object({ source: sourceName, slug }),
  }),
  remove_link: z.object({
    from: z.object({ source: sourceName, slug }),
    to: z.object({ source: sourceName, slug }),
  }),
  get_links: z.object({ source: sourceName, slug }),
  get_backlinks: z.object({ source: sourceName, slug }),
  add_timeline_entry: z.object({
    source: sourceName,
    slug,
    date: z.string(),
    title: z.string().min(1),
    detail: z.string().nullable().optional(),
  }),
  get_timeline: z.object({ source: sourceName, slug }),
  remember: z.object({
    source: sourceName,
    slug,
    entity: z.string().min(1),
    statement: z.string().min(1),
    confidence: z.number().nullable().optional(),
    valid_until: z.string().nullable().optional(),
    id: z.string().optional(),
  }),
  forget: z.object({ source: sourceName, slug, id: z.string().min(1) }),
  recall: z.object({
    entity: z.string().optional(),
    q: z.string().optional(),
    limit: z.number().int().min(1).optional(),
  }),
  sources_list: z.object({}),
  sources_add: z.object({ id: sourceName }),
  sources_delete: z.object({ id: sourceName }),
  sources_restore: z.object({ id: sourceName }),
  sources_status: z.object({ id: sourceName }),
  whoami: z.object({}),
  list_skills: z.object({}),
  get_skill: z.object({ name: z.enum(["data", "original-page"]) }),
  list_sites: z.object({}),
  get_site: z.object({}),
  put_site: z.object({ archive_base64: z.string().min(1) }),
  preview_site: z.object({ id: z.string().min(1) }),
  activate_site: z.object({ release_id: z.string().min(1) }),
  login: z.object({ login: z.string().min(1), password: z.string() }),
  password: z.object({ password: z.string().min(1) }),
  device_approval: z.object({
    user_code: z.string().min(1),
    site_write: z.boolean(),
    sources: z.array(grant),
  }),
  site_decision: z.object({ decision: z.enum(["approve", "reject"]) }),
  create_api_key: z.object({
    label: z.string().min(1),
    unrestricted_data: z.boolean(),
    site_write: z.boolean(),
    sources: z.array(grant),
  }),
} as const;

export type OperationSchemaName = keyof typeof operationSchemas;

export function parseOperation<Name extends OperationSchemaName>(
  name: Name,
  value: unknown,
): z.output<(typeof operationSchemas)[Name]> | null {
  const parsed = operationSchemas[name].safeParse(value);
  if (!parsed.success) {
    return null;
  }
  return parsed.data as z.output<(typeof operationSchemas)[Name]>;
}
