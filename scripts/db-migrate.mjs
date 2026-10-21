import { spawnSync } from "node:child_process";

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.length === 0) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  [
    "--filter",
    "@oneself/db",
    "exec",
    "drizzle-kit",
    "migrate",
    "--config",
    "src/drizzle.config.ts",
  ],
  { stdio: "inherit", env: process.env },
);

process.exit(result.status ?? 1);
