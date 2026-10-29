import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies packaged SQL migrations before the process listens.
 * Pending files run in journal order. A failure rolls back that file and must
 * stop startup so requests never see a half-migrated database.
 */
export async function migrateDatabase(
  databaseUrl: string,
  migrationsFolder: string,
): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
