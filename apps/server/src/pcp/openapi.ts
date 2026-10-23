import { errorCodes, operations, publicEndpoints, type HttpMethod } from "@oneself/operations";
import { z } from "zod";

import { operationSchemas, publicSchemas } from "../app/schemas.ts";
import { authHeaders, isUpload, uploads } from "./discovery.ts";

type Json = Record<string, unknown>;

/**
 * OpenAPI is generated from the operation registry and the same zod schemas
 * that MCP publishes as tool input schemas, so HTTP and MCP parameters cannot
 * drift. Path placeholders become path parameters, the remaining fields are
 * the query string for GET and the JSON body otherwise. The two uploads are
 * multipart over HTTP; their fields and limits come from `uploads`.
 */
export function openApiDocument(origin: string): Json {
  const paths: Record<string, Json> = {};
  const authenticated = declaredSchemes.map(({ name }) => ({ [name]: [] }));
  for (const operation of operations) {
    const schema = Object.hasOwn(operationSchemas, operation.name)
      ? operationSchemas[operation.name as keyof typeof operationSchemas]
      : z.object({});
    const item: Json = {
      operationId: operation.name,
      security: operation.httpOnly
        ? [{ ownerSession: [] }]
        : [...authenticated, { ownerSession: [] }],
      ...input(operation.method, operation.path, schema),
      responses: responses(operation.name),
    };
    if (isUpload(operation.name)) {
      const upload = uploads[operation.name];
      item.requestBody = multipart(upload);
      item["x-oneself-upload"] = upload;
    }
    setOperation(paths, operation.path, operation.method, item);
  }
  for (const endpoint of publicEndpoints) {
    setOperation(paths, endpoint.path, endpoint.method, {
      operationId: endpoint.name,
      description: "Anonymous. Send no credential: use credentials: omit.",
      security: [],
      "x-oneself-credentials": "omit",
      ...input(
        endpoint.method,
        endpoint.path,
        publicSchemas[endpoint.name as keyof typeof publicSchemas],
      ),
      responses: responses(endpoint.name),
    });
  }
  return {
    openapi: "3.1.0",
    info: { title: "OneSelf PCP", version: "1" },
    servers: [{ url: origin }],
    paths,
    components: { securitySchemes: securitySchemes(origin) },
  };
}

type AuthHeader = (typeof authHeaders)[number];

/**
 * The OpenAPI scheme for one accepted header, derived from the header's value template so the
 * document and discovery cannot disagree (decision 23). A raw `<key>` value is an `apiKey`
 * scheme; `Bearer <token>` is the registered `http` bearer scheme. `Authorization: ApiKey <key>`
 * has no standard scheme (an `apiKey` scheme on Authorization would make clients send the bare
 * key), so it is named in the description of the raw-key scheme instead of declared.
 */
function openApiSchemeFor(header: AuthHeader): { name: string; scheme: Json } | null {
  if (header.value === "Bearer <access_token>") {
    return { name: "oauthBearer", scheme: { type: "http", scheme: "bearer" } };
  }
  if (header.value === "<key>") {
    return { name: "apiKeyHeader", scheme: { type: "apiKey", in: "header", name: header.header } };
  }
  return null;
}

const declaredSchemes = authHeaders.flatMap((header) => {
  const declared = openApiSchemeFor(header);
  return declared === null ? [] : [{ header, ...declared }];
});

function securitySchemes(origin: string): Json {
  const schemes: Json = {};
  const undeclared = authHeaders
    .filter((header) => openApiSchemeFor(header) === null)
    .map((header) => `${header.header}: ${header.value}`);
  for (const { header, name, scheme } of declaredSchemes) {
    const also =
      header.credential === "api_key" && undeclared.length > 0
        ? ` Also accepted: ${undeclared.join("; ")}.`
        : "";
    const source =
      header.credential === "oauth"
        ? `Access token from the OAuth device flow in ${origin}/.well-known/oauth-authorization-server.`
        : "The owner creates and approves keys in the admin UI.";
    schemes[name] = {
      ...scheme,
      description: `${header.header}: ${header.value}. ${source}${also}`,
    };
  }
  schemes.ownerSession = {
    type: "apiKey",
    in: "cookie",
    name: "oneself_session",
    description: "Owner admin session. Key management accepts only this.",
  };
  return schemes;
}

function inputJsonSchema(schema: z.ZodType): Json {
  const json = { ...(z.toJSONSchema(schema, { io: "input" }) as Json) };
  delete json.$schema;
  return json;
}

function input(method: HttpMethod, path: string, schema: z.ZodType): Json {
  const json = inputJsonSchema(schema);
  const properties = (json.properties ?? {}) as Record<string, Json>;
  const required = new Set((json.required ?? []) as string[]);
  const inPath = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "");
  const parameters: Json[] = inPath.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: properties[name] ?? { type: "string" },
  }));
  const rest = Object.entries(properties).filter(([name]) => !inPath.includes(name));
  if (method === "GET") {
    for (const [name, property] of rest) {
      parameters.push({ name, in: "query", required: required.has(name), schema: property });
    }
    return parameters.length > 0 ? { parameters } : {};
  }
  const result: Json = parameters.length > 0 ? { parameters } : {};
  if (rest.length > 0) {
    const bodyRequired = rest.map(([name]) => name).filter((name) => required.has(name));
    result.requestBody = {
      required: bodyRequired.length > 0,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: Object.fromEntries(rest),
            ...(bodyRequired.length > 0 ? { required: bodyRequired } : {}),
          },
        },
      },
    };
  }
  return result;
}

/**
 * Multipart body for an upload. The part is binary (`format: binary` for 3.0-era generators,
 * `contentMediaType` for 3.1); the accepted types come from `uploads`, which reads the domain
 * constants the runtime enforces. One type is stated directly; several are listed as `anyOf`
 * (annotations only, so `oneOf` would never match exactly one) and in `encoding.contentType`,
 * which OpenAPI 3.1 defines as a media type or a comma-separated list of media types.
 */
function multipart(upload: (typeof uploads)[keyof typeof uploads]): Json {
  const types: readonly string[] = upload.media_types;
  const limits = [
    `at most ${String(upload.max_bytes)} bytes`,
    ...("max_files" in upload ? [`at most ${String(upload.max_files)} files`] : []),
  ].join(", ");
  const media =
    types.length === 1
      ? { contentMediaType: types[0] }
      : { anyOf: types.map((type) => ({ contentMediaType: type })) };
  return {
    required: true,
    content: {
      "multipart/form-data": {
        schema: {
          type: "object",
          properties: {
            [upload.field]: {
              type: "string",
              format: "binary",
              ...media,
              description: `${types.length === 1 ? "" : "One of "}${types.join(", ")}; ${limits}.`,
            },
          },
          required: [upload.field],
        },
        encoding: { [upload.field]: { contentType: types.join(", ") } },
      },
    },
  };
}

/**
 * One response per status. Several error codes can share a status (403 is `forbidden` and
 * `password_change_required`), so each status lists all of its codes in the description and in
 * the `error` enum of the body schema instead of the last one overwriting the others.
 */
function responses(name: string): Json {
  const byStatus = new Map<number, string[]>();
  for (const errorCode of errorCodes) {
    byStatus.set(errorCode.status, [...(byStatus.get(errorCode.status) ?? []), errorCode.error]);
  }
  const result: Json = { "200": { description: name } };
  for (const [status, codes] of byStatus) {
    result[String(status)] = {
      description: codes.join(" or "),
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              error: { type: "string", enum: codes },
              message: { type: "string" },
            },
            required: ["error", "message"],
            additionalProperties: false,
          },
        },
      },
    };
  }
  return result;
}

function setOperation(paths: Record<string, Json>, path: string, method: HttpMethod, item: Json) {
  const pathItem = paths[path] ?? {};
  pathItem[method.toLowerCase()] = item;
  paths[path] = pathItem;
}
