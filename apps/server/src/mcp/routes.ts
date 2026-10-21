import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { generateTransports } from "@oneself/operations";
import type { Hono } from "hono";
import { z } from "zod";

import { isRecord } from "../app/json.js";
import type { Runtime } from "../app/runtime.js";
import { callTool } from "./call.js";

const toolInput = z.looseObject({
  source: z.string().optional(),
  slug: z.string().optional(),
  markdown: z.string().optional(),
  hash: z.string().optional(),
  edits: z.array(z.object({ search: z.string(), replace: z.string() })).optional(),
  pages: z
    .array(
      z.object({
        source: z.string(),
        slug: z.string(),
        markdown: z.string(),
        hash: z.string().optional(),
      }),
    )
    .optional(),
  slugs: z.array(z.object({ source: z.string(), slug: z.string() })).optional(),
  q: z.string().optional(),
  limit: z.number().optional(),
  cursor: z.string().optional(),
  type: z.string().optional(),
  tag: z.string().optional(),
  prefix: z.string().optional(),
  updated_after: z.string().optional(),
  updated_before: z.string().optional(),
  from: z.object({ source: z.string(), slug: z.string() }).optional(),
  to: z.object({ source: z.string(), slug: z.string() }).optional(),
  date: z.string().optional(),
  title: z.string().optional(),
  detail: z.string().nullable().optional(),
  entity: z.string().optional(),
  statement: z.string().optional(),
  confidence: z.number().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  id: z.string().optional(),
  release_id: z.string().optional(),
  name: z.string().optional(),
  data_base64: z.string().optional(),
  media_type: z.string().optional(),
  archive_base64: z.string().optional(),
});

export function mountMcp(app: Hono, runtime: Runtime): void {
  app.post("/mcp", async (c) => {
    const actor = await runtime.authenticate(c.req.raw);
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    const server = new McpServer({ name: "oneself", version: "1" });
    for (const tool of generateTransports().mcp) {
      server.registerTool(
        tool.name,
        {
          description: tool.name,
          inputSchema: toolInput,
        },
        async (args) => {
          const fields: Record<string, unknown> = {};
          if (isRecord(args)) {
            for (const [key, value] of Object.entries(args)) {
              if (value !== undefined) {
                fields[key] = value;
              }
            }
          }
          if (
            (tool.name === "file_upload" || tool.name === "put_site") &&
            !(await runtime.allow("upload", runtime.clientAddress(c.req.raw)))
          ) {
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "forbidden", message: "rate limit exceeded" }),
                },
              ],
            };
          }
          const result = await callTool(runtime, tool.name, fields, actor);
          if (!result.ok) {
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: result.error, message: result.message }),
                },
              ],
            };
          }
          if (result.value instanceof Uint8Array) {
            const text =
              tool.name === "get_site"
                ? JSON.stringify({ content_base64: Buffer.from(result.value).toString("base64") })
                : new TextDecoder().decode(result.value);
            return { content: [{ type: "text" as const, text }] };
          }
          return { content: [{ type: "text" as const, text: JSON.stringify(result.value) }] };
        },
      );
    }
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });
}
