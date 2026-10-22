import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { generateTransports } from "@oneself/operations";
import type { Hono } from "hono";
import { z } from "zod";

import { isRecord } from "../app/json.ts";
import { operationSchemas, type OperationSchemaName } from "../app/schemas.ts";
import type { Runtime } from "../app/runtime.ts";
import { callTool } from "./call.ts";

function schemaFor(name: string): z.ZodType {
  if (Object.hasOwn(operationSchemas, name)) {
    return operationSchemas[name as OperationSchemaName];
  }
  return z.object({});
}

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
          inputSchema: schemaFor(tool.name),
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
