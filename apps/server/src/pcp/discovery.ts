import { errorCodes, operations } from "@oneself/operations";

export function discoveryDocument(origin: string): Record<string, unknown> {
  return {
    protocol: "pcp",
    version: "1",
    operations: operations
      .filter((operation) => !operation.httpOnly)
      .map((operation) => ({
        name: operation.name,
        method: operation.method,
        path: operation.path,
      })),
    openapi: `${origin}/openapi.json`,
    mcp: `${origin}/mcp`,
    oauth: `${origin}/.well-known/oauth-authorization-server`,
    skills: {
      context_management: `${origin}/skills/context-management.md`,
      public_page: `${origin}/skills/public-page.md`,
    },
  };
}

export function oauthMetadata(origin: string): Record<string, unknown> {
  return {
    issuer: origin,
    device_authorization_endpoint: `${origin}/oauth/device/auth`,
    token_endpoint: `${origin}/oauth/token`,
    grant_types_supported: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
  };
}

export function openApiDocument(origin: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of operations) {
    const pathItem = paths[operation.path] ?? {};
    const responses: Record<string, { description: string }> = {
      "200": { description: operation.name },
    };
    for (const errorCode of errorCodes) {
      responses[String(errorCode.status)] = { description: errorCode.error };
    }
    pathItem[operation.method.toLowerCase()] = {
      operationId: operation.name,
      responses,
    };
    paths[operation.path] = pathItem;
  }
  return {
    openapi: "3.1.0",
    info: { title: "OneSelf PCP", version: "1" },
    servers: [{ url: origin }],
    paths,
  };
}
