/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "operations-has-no-outside-imports",
      severity: "error",
      comment: "The operation registry stays a zero-dependency package.",
      from: { path: "^packages/operations/", pathNot: "\\.test\\.ts$" },
      to: { pathNot: "^packages/operations/" },
    },
    {
      name: "domain-stays-pure",
      severity: "error",
      comment:
        "Domain rules do not import the server, React, the database, or object storage SDKs.",
      from: { path: "^packages/domain/" },
      to: {
        path: [
          "^apps/",
          "^packages/(db|adapters|operations|public-page|public-client)/",
          "(^|/)node_modules/(hono|react|react-dom|drizzle-orm|pg|@aws-sdk)(/|$)",
        ],
      },
    },
    {
      name: "adapters-do-not-import-domain",
      severity: "error",
      comment: "Adapters exchange plain port values. The server maps them onto domain types.",
      from: { path: "^packages/adapters/" },
      to: { path: "^packages/(domain|operations|public-page|public-client)/|^apps/" },
    },
    {
      name: "db-is-schema-only",
      severity: "error",
      comment: "The database package holds tables and migrations, not application rules.",
      from: { path: "^packages/db/" },
      to: {
        path: [
          "^packages/(domain|operations|adapters|ports|public-page|public-client)/",
          "^apps/",
          "(^|/)node_modules/(hono|react|react-dom)(/|$)",
        ],
      },
    },
    {
      name: "ports-are-types",
      severity: "error",
      comment:
        "Ports declare storage, clock, and Markdown types. Implementations stay in adapters.",
      from: { path: "^packages/ports/", pathNot: "\\.test\\.ts$" },
      to: {
        path: [
          "^packages/(?!ports/)",
          "^apps/",
          "(^|/)node_modules/(hono|react|react-dom|drizzle-orm|pg|@aws-sdk)(/|$)",
        ],
      },
    },
    {
      name: "ui-does-not-import-domain-or-db",
      severity: "error",
      comment:
        "Admin, original pages, and the public client call HTTP. They may use the operation registry.",
      from: { path: "^apps/admin/|^packages/(public-page|public-client)/" },
      to: { path: "^packages/(domain|db|adapters)/" },
    },
    {
      name: "only-the-server-imports-the-server",
      severity: "error",
      comment: "Other packages do not reach into the single Node process.",
      from: { pathNot: "^apps/server/" },
      to: { path: "^apps/server/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
