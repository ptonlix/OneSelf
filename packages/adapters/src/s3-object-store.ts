import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
  type HeadObjectCommandOutput,
  type ListObjectsV2CommandOutput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { ObjectHead, ObjectStore, StoredObject } from "@oneself/ports";

export type S3ObjectStoreConfig = {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

type ObjectSummary = {
  readonly byteSize: number;
  readonly writtenAt: Date;
};

/**
 * Bucket operations used by the object store.
 * Tests pass a fake. Production uses the S3 client adapter below.
 */
export type S3Bucket = {
  head(key: string): Promise<ObjectSummary | null>;
  get(key: string): Promise<StoredObject | null>;
  put(key: string, body: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<readonly ObjectHead[]>;
};

type S3Command =
  | HeadObjectCommand
  | GetObjectCommand
  | PutObjectCommand
  | DeleteObjectCommand
  | ListObjectsV2Command;

export type S3CommandClient = {
  send(command: S3Command): Promise<unknown>;
};

/**
 * Path-style RustFS endpoint.
 * Checksums are sent only when the operation requires them; the SDK default
 * rejects requests on this S3-compatible server.
 */
export function s3ClientConfig(config: S3ObjectStoreConfig): S3ClientConfig {
  return {
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };
}

export function openS3ObjectStore(config: S3ObjectStoreConfig): ObjectStore {
  const client = new S3Client(s3ClientConfig(config));
  return objectStoreFromBucket(s3BucketFromClient(client, config.bucket));
}

/** Existing keys are left untouched, including their first write time. */
export function objectStoreFromBucket(bucket: S3Bucket): ObjectStore {
  return {
    async put(key, body) {
      const existing = await bucket.head(key);
      if (existing !== null) {
        return { created: false };
      }
      await bucket.put(key, body);
      return { created: true };
    },
    get(key) {
      return bucket.get(key);
    },
    async delete(key) {
      await bucket.delete(key);
    },
    list(prefix) {
      return bucket.list(prefix);
    },
  };
}

export function s3BucketFromClient(client: S3CommandClient, bucket: string): S3Bucket {
  return {
    async head(key) {
      try {
        const response = (await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        )) as HeadObjectCommandOutput;
        return {
          byteSize: response.ContentLength ?? 0,
          writtenAt: writtenAt(response.LastModified, key),
        };
      } catch (error) {
        if (isMissingObjectError(error)) {
          return null;
        }
        throw error;
      }
    },
    async get(key) {
      try {
        const response = (await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        )) as GetObjectCommandOutput;
        const body = await readBody(response.Body);
        return {
          key,
          body,
          byteSize: body.byteLength,
          writtenAt: writtenAt(response.LastModified, key),
        };
      } catch (error) {
        if (isMissingObjectError(error)) {
          return null;
        }
        throw error;
      }
    },
    async put(key, body) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async list(prefix) {
      const heads: ObjectHead[] = [];
      let continuationToken: string | undefined;
      do {
        const response = (await client.send(
          new ListObjectsV2Command(
            continuationToken === undefined
              ? { Bucket: bucket, Prefix: prefix }
              : { Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken },
          ),
        )) as ListObjectsV2CommandOutput;
        for (const item of response.Contents ?? []) {
          if (item.Key === undefined) {
            continue;
          }
          if (item.Size === undefined) {
            throw new Error(`Object storage did not return a size for ${item.Key}`);
          }
          heads.push({
            key: item.Key,
            byteSize: item.Size,
            writtenAt: writtenAt(item.LastModified, item.Key),
          });
        }
        continuationToken =
          response.IsTruncated === true ? response.NextContinuationToken : undefined;
      } while (continuationToken !== undefined);
      return heads;
    },
  };
}

function writtenAt(value: Date | undefined, key: string): Date {
  if (value === undefined) {
    throw new Error(`Object storage did not return a write time for ${key}`);
  }
  return value;
}

async function readBody(body: GetObjectCommandOutput["Body"]): Promise<Uint8Array> {
  if (body === undefined) {
    return new Uint8Array();
  }
  const bytes = await body.transformToByteArray();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function isMissingObjectError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  const name = error["name"];
  if (name === "NotFound" || name === "NoSuchKey") {
    return true;
  }
  const metadata = error["$metadata"];
  return isRecord(metadata) && metadata["httpStatusCode"] === 404;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
