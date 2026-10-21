# 数据库表

`docs/PRD.md` 第 6.3 节和 `docs/ARCHITECTURE.md` 第 5 节只写了每张表的用途。列、类型和约束以本文件为准。实现放在 `packages/db`，只追加 migration，不按资料 `type` 另建表。

PostgreSQL 18。时间用 `timestamptz`。哈希都是小写十六进制。正文不进 `page_versions`。密钥和刷新令牌只存 SHA-256，不存原文。

对象键不在这些表的字节里：原文 `pages/{source}/{slug}/{sha256}.md`，原件 `files/{id}`，站点文件 `sites/{releaseId}/{path}`。

## sources

业务目录。主键就是名字，不表示公开或私有。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `text` | 主键。`^[a-z][a-z0-9-]{0,62}$` |
| `deleted_at` | `timestamptz` | 可空。非空表示目录软删除 |

## pages

当前投影。`get_page` 读这里，不每次回源对象。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `source` | `text` | 主键之一。引用 `sources.id` |
| `slug` | `text` | 主键之一。`^[a-z0-9][a-z0-9-]{0,79}$`，不含 `/` |
| `type` | `text` | 非空。与 `source` 同一模式。从 frontmatter 投影 |
| `title` | `text` | 非空。只认 frontmatter，不认标题 |
| `visibility` | `text` | 非空。`public` 或 `private`。从 frontmatter 投影。缺省 `private` |
| `frontmatter` | `jsonb` | 非空。原始 frontmatter |
| `body` | `text` | 非空。围栏外正文加上围栏原文 |
| `content_hash` | `text` | 非空。UTF-8 SHA-256 |
| `object_key` | `text` | 非空。当前原文对象键 |
| `updated_at` | `timestamptz` | 非空。`query` 的时间过滤用它 |
| `deleted_at` | `timestamptz` | 可空。非空表示软删除 |
| `hidden_by_source` | `boolean` | 非空，缺省假。为真表示这次不可读是因目录删除一起发生的 |

索引：`(source, type)`；`frontmatter` 用 GIN；`title` 与 `body` 用全文检索。`search` 查 `type`、标题、正文和 frontmatter 字符串，不查 `chunks`。

## page_versions

每次成功写入追加一行。每页只留最近 50 条。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `bigint` | 主键。生成列 |
| `source` | `text` | 非空 |
| `slug` | `text` | 非空 |
| `content_hash` | `text` | 非空 |
| `object_key` | `text` | 非空 |
| `frontmatter` | `jsonb` | 非空 |
| `written_at` | `timestamptz` | 非空 |

没有正文列。

## files

原件元数据。字节在对象存储。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `text` | 主键 |
| `object_key` | `text` | 非空。`files/{id}` |
| `media_type` | `text` | 非空。只允许 JPEG、PNG、WebP、GIF、PDF |
| `byte_size` | `bigint` | 非空。最大 20 MiB |
| `sha256` | `text` | 非空 |
| `page_source` | `text` | 可空。挂接后的页 |
| `page_slug` | `text` | 可空。与 `page_source` 同空或同非空 |
| `created_at` | `timestamptz` | 非空 |

一个文件最多属于一页。`(page_source, page_slug)` 引用未删除或已删除的 `pages` 均可，删除页时不删原件行。

## chunks

可由 `pages` 重建。按空行切块，单块最多 1000 字。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `source` | `text` | 主键之一 |
| `slug` | `text` | 主键之一 |
| `ordinal` | `integer` | 主键之一。从 0 起 |
| `body` | `text` | 非空。长度不超过 1000 |

## links

从 `[[source/slug]]` 抽出。没有类型列。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `from_source` | `text` | 主键之一 |
| `from_slug` | `text` | 主键之一 |
| `to_source` | `text` | 主键之一 |
| `to_slug` | `text` | 主键之一 |

## tags

只投影 frontmatter 的 `tags` 字符串数组。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `source` | `text` | 主键之一 |
| `slug` | `text` | 主键之一 |
| `tag` | `text` | 主键之一 |

## facts

只来自当前页的 `## Facts`。`id` 只在一页内唯一。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `source` | `text` | 主键之一 |
| `slug` | `text` | 主键之一 |
| `id` | `text` | 主键之一 |
| `entity` | `text` | 非空 |
| `statement` | `text` | 非空 |
| `confidence` | `numeric` | 可空。0 到 1 |
| `valid_until` | `date` | 可空。`YYYY-MM-DD` |

## timeline_entries

只来自当前页的 `## Timeline`。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `source` | `text` | 主键之一 |
| `slug` | `text` | 主键之一 |
| `ordinal` | `integer` | 主键之一。保持原文顺序 |
| `occurred_on` | `date` | 非空 |
| `title` | `text` | 非空 |
| `detail` | `text` | 可空 |

## site_releases

一次上传的不可变元数据。第一版不删除。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `text` | 主键。`rel_` 加 32 位十六进制 |
| `created_at` | `timestamptz` | 非空 |

## site_files

该 release 里每个路径对应的对象键。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `release_id` | `text` | 主键之一。引用 `site_releases.id` |
| `path` | `text` | 主键之一。相对路径，无 `..` |
| `object_key` | `text` | 非空。`sites/{releaseId}/{path}` |

## site_pointers

只有一行。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `integer` | 主键。值只能是 `1` |
| `release_id` | `text` | 非空。`original` 或某个 `site_releases.id` |

## site_activations

上线申请。同意前不改 `site_pointers`。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `text` | 主键 |
| `release_id` | `text` | 非空。`rel_...` 或 `original` |
| `status` | `text` | 非空。`pending`、`approved`、`rejected` 或 `expired` |
| `expires_at` | `timestamptz` | 非空。创建后 15 分钟 |
| `created_at` | `timestamptz` | 非空 |
| `decided_at` | `timestamptz` | 可空 |

## owners

唯一所属人。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `integer` | 主键。值只能是 `1` |
| `login` | `text` | 非空 |
| `password_hash` | `text` | 非空。Argon2id |
| `must_change_password` | `boolean` | 非空 |

## api_keys

已生效密钥。不存原文。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `text` | 主键 |
| `key_hash` | `text` | 非空。SHA-256。唯一 |
| `label` | `text` | 非空 |
| `unrestricted_data` | `boolean` | 非空。为真时包含以后新建的 source |
| `site_write` | `boolean` | 非空 |
| `sources` | `jsonb` | 非空。`[{id, read, write, visibility}]`。`unrestricted_data` 为真时可为空数组 |
| `created_at` | `timestamptz` | 非空 |
| `last_used_at` | `timestamptz` | 可空 |
| `revoked_at` | `timestamptz` | 可空 |

## api_key_requests

尚未生成密钥的批准请求。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `text` | 主键 |
| `label` | `text` | 非空 |
| `unrestricted_data` | `boolean` | 非空 |
| `site_write` | `boolean` | 非空 |
| `sources` | `jsonb` | 非空。形状同 `api_keys.sources` |
| `status` | `text` | 非空。`pending`、`confirmed` 或 `expired` |
| `expires_at` | `timestamptz` | 非空。创建后 15 分钟 |
| `created_at` | `timestamptz` | 非空 |
| `api_key_id` | `text` | 可空。确认后指向 `api_keys.id` |

## oauth_grants

设备码授权。不存访问令牌原文，不存 API Key。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `text` | 主键 |
| `site_write` | `boolean` | 非空 |
| `sources` | `jsonb` | 非空。形状同 `api_keys.sources` |
| `refresh_token_hash` | `text` | 可空。批准前为空。SHA-256。轮换后改成新哈希 |
| `revoked_at` | `timestamptz` | 可空。重用已轮换的刷新令牌时必须写上 |
| `created_at` | `timestamptz` | 非空 |

设备码本身的待批准状态由 `node-oidc-provider` 的适配存储保存。那部分不是业务表，不放页、原件或站点指针。

## 清理和重建

每小时：删掉 `deleted_at` 早于 30 天的 `pages` 及其 `page_versions`、`chunks`、`links`、`tags`、`facts`、`timeline_entries`。同样删掉软删除超过 30 天的 `sources`；这些页上的原件只解除挂接，不删字节。不删 `site_releases`。没有任何页、版本或文件引用、且写入超过 7 天的对象删除。

重建只重写 `pages`、`chunks`、`links`、`tags`、`facts`、`timeline_entries`。不改 `sources` 以外的授权、`api_keys`、`api_key_requests`、`oauth_grants`、`owners` 和 `site_pointers`。
