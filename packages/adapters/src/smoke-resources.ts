import {
  CreateBucketCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import postgres from "postgres";

import { s3ClientConfig, type S3ObjectStoreConfig } from "./s3-object-store.ts";

// Provisioning for the closed-loop smoke test (tests/smoke/closed-loop.test.ts). It reuses the
// running dev services from compose.dev.yaml but only ever touches its own database and bucket,
// whose names must contain "smoke". Nothing here is used by the server at runtime.

const START_DEV_SERVICES = "Start the dev services with: docker compose -f compose.dev.yaml up -d";

/** Throws unless the name is clearly a smoke resource, so dev data is never dropped. */
export function assertSmokeResourceName(kind: "database" | "bucket", name: string): void {
  if (name === "oneself" || !name.includes("smoke")) {
    throw new Error(
      `Refusing to use ${kind} "${name}" for the smoke test: the name must contain "smoke" and must not be the dev ${kind} "oneself".`,
    );
  }
}

function unreachable(service: string, target: string, error: unknown): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`${service} at ${target} is not reachable (${reason}). ${START_DEV_SERVICES}`, {
    cause: error,
  });
}

function hostOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || "5432"}`;
}

/**
 * Creates the smoke database if needed (via the admin connection), then resets its `public`
 * schema and applies every migration statement in order.
 */
export async function prepareSmokeDatabase(options: {
  readonly adminUrl: string;
  readonly databaseUrl: string;
  readonly database: string;
  readonly statements: readonly string[];
}): Promise<void> {
  assertSmokeResourceName("database", options.database);
  if (new URL(options.databaseUrl).pathname !== `/${options.database}`) {
    throw new Error(`Smoke database URL does not point at "${options.database}".`);
  }
  const settings = { max: 1, connect_timeout: 5, onnotice: () => undefined };
  const admin = postgres(options.adminUrl, settings);
  try {
    try {
      await admin`select 1`;
    } catch (error) {
      throw unreachable("PostgreSQL", hostOf(options.adminUrl), error);
    }
    try {
      await admin`create database ${admin(options.database)}`;
    } catch (error) {
      if ((error as { code?: unknown }).code !== "42P04") {
        throw error;
      }
    }
  } finally {
    await admin.end({ timeout: 5 });
  }
  const smoke = postgres(options.databaseUrl, settings);
  try {
    await smoke.unsafe("drop schema if exists public cascade");
    await smoke.unsafe("create schema public");
    for (const statement of options.statements) {
      await smoke.unsafe(statement);
    }
  } finally {
    await smoke.end({ timeout: 5 });
  }
}

/** Creates the smoke bucket if needed and deletes every object in it. */
export async function prepareSmokeBucket(config: S3ObjectStoreConfig): Promise<void> {
  assertSmokeResourceName("bucket", config.bucket);
  const client = new S3Client({ ...s3ClientConfig(config), maxAttempts: 1 });
  try {
    try {
      await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
    } catch (error) {
      const name = (error as { name?: unknown }).name;
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") {
        throw status === undefined ? unreachable("Object storage", config.endpoint, error) : error;
      }
    }
    let token: string | undefined;
    do {
      const page: ListObjectsV2CommandOutput = await client.send(
        new ListObjectsV2Command({ Bucket: config.bucket, ContinuationToken: token }),
      );
      // One request per key: DeleteObjects needs a Content-MD5 checksum, single deletes do not.
      for (const item of page.Contents ?? []) {
        if (item.Key !== undefined) {
          await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: item.Key }));
        }
      }
      token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
    } while (token !== undefined);
  } finally {
    client.destroy();
  }
}
