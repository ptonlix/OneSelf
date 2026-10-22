import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { expectObjectStoreKeepsExistingKeys } from "./object-store-contract.ts";
import {
  objectStoreFromBucket,
  s3BucketFromClient,
  s3ClientConfig,
  type S3CommandClient,
} from "./s3-object-store.ts";

describe("s3 object store", () => {
  it("does not rewrite an existing key and does not open a socket", async () => {
    const client = new MemoryS3();
    const store = objectStoreFromBucket(s3BucketFromClient(client, "oneself"));
    await expectObjectStoreKeepsExistingKeys(store);
    expect(client.commands).toEqual([
      "HeadObjectCommand",
      "PutObjectCommand",
      "HeadObjectCommand",
      "HeadObjectCommand",
      "PutObjectCommand",
      "GetObjectCommand",
      "GetObjectCommand",
      "ListObjectsV2Command",
      "ListObjectsV2Command",
      "DeleteObjectCommand",
      "DeleteObjectCommand",
      "GetObjectCommand",
    ]);
  });

  it("lists every page of keys without fetching bodies", async () => {
    const writtenAt = new Date("2026-10-21T00:00:00.000Z");
    const client: S3CommandClient = {
      send(command) {
        if (!(command instanceof ListObjectsV2Command)) {
          throw new Error(`unexpected ${command.constructor.name}`);
        }
        if (command.input.ContinuationToken === undefined) {
          return Promise.resolve({
            Contents: [{ Key: "pages/a", Size: 2, LastModified: writtenAt }],
            IsTruncated: true,
            NextContinuationToken: "next",
          });
        }
        expect(command.input.ContinuationToken).toBe("next");
        return Promise.resolve({
          Contents: [
            { Key: "pages/b", Size: 1, LastModified: writtenAt },
            { Size: 4, LastModified: writtenAt },
          ],
          IsTruncated: false,
        });
      },
    };
    const heads = await s3BucketFromClient(client, "oneself").list("pages/");
    expect(heads).toEqual([
      { key: "pages/a", byteSize: 2, writtenAt },
      { key: "pages/b", byteSize: 1, writtenAt },
    ]);
  });

  it("propagates storage failures that are not a missing key", async () => {
    const client: S3CommandClient = {
      send() {
        return Promise.reject(Object.assign(new Error("unavailable"), { name: "InternalError" }));
      },
    };
    const store = objectStoreFromBucket(s3BucketFromClient(client, "oneself"));
    await expect(store.put("pages/a", new Uint8Array([1]))).rejects.toThrow("unavailable");
  });

  it("configures a path-style RustFS client without default checksums", () => {
    expect(
      s3ClientConfig({
        endpoint: "http://rustfs:9000",
        region: "us-east-1",
        bucket: "oneself",
        accessKeyId: "oneself",
        secretAccessKey: "oneselfsecret",
      }),
    ).toMatchObject({
      endpoint: "http://rustfs:9000",
      region: "us-east-1",
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: "oneself",
        secretAccessKey: "oneselfsecret",
      },
    });
  });
});

class MemoryS3 implements S3CommandClient {
  readonly commands: string[] = [];
  private readonly objects = new Map<string, { body: Uint8Array; writtenAt: Date }>();

  send(command: Parameters<S3CommandClient["send"]>[0]): Promise<unknown> {
    this.commands.push(command.constructor.name);
    if (command instanceof HeadObjectCommand) {
      return Promise.resolve(this.head(command.input.Key));
    }
    if (command instanceof PutObjectCommand) {
      return Promise.resolve(this.put(command.input.Key, command.input.Body));
    }
    if (command instanceof GetObjectCommand) {
      return Promise.resolve(this.get(command.input.Key));
    }
    if (command instanceof DeleteObjectCommand) {
      this.objects.delete(command.input.Key ?? "");
      return Promise.resolve({});
    }
    return Promise.resolve(this.list(command.input.Prefix ?? ""));
  }

  private head(key: string | undefined): unknown {
    const found = this.objects.get(key ?? "");
    if (found === undefined) {
      throw missing("NotFound");
    }
    return { ContentLength: found.body.byteLength, LastModified: found.writtenAt };
  }

  private put(key: string | undefined, body: unknown): unknown {
    if (!(body instanceof Uint8Array)) {
      throw new Error("expected bytes");
    }
    this.objects.set(key ?? "", {
      body: new Uint8Array(body),
      writtenAt: new Date("2026-10-20T00:00:00.000Z"),
    });
    return {};
  }

  private get(key: string | undefined): unknown {
    const found = this.objects.get(key ?? "");
    if (found === undefined) {
      throw missing("NoSuchKey");
    }
    const body = new Uint8Array(found.body);
    return {
      Body: { transformToByteArray: () => Promise.resolve(body) },
      ContentLength: body.byteLength,
      LastModified: found.writtenAt,
    };
  }

  private list(prefix: string): unknown {
    const contents = [];
    for (const [key, value] of this.objects) {
      if (key.startsWith(prefix)) {
        contents.push({ Key: key, Size: value.body.byteLength, LastModified: value.writtenAt });
      }
    }
    return { Contents: contents, IsTruncated: false };
  }
}

function missing(name: string): Error {
  return Object.assign(new Error(name), {
    name,
    $metadata: { httpStatusCode: 404 },
  });
}
