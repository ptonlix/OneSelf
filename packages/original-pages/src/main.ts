import { createPublicClient } from "@oneself/public-client";
import type { PublicClient } from "@oneself/public-client";
import { loadOriginalPage } from "./load";
import type { ObjectUrlFactory } from "./load";
import { renderStatus } from "./render";

type MountPoint = {
  innerHTML: string;
};

type BrowserDocument = {
  querySelector(selector: string): MountPoint | null;
};

export async function mountOriginalPage(
  document: BrowserDocument,
  client: PublicClient,
  createObjectUrl: ObjectUrlFactory,
): Promise<void> {
  const app = document.querySelector("#app");
  if (app === null) {
    return;
  }
  try {
    app.innerHTML = await loadOriginalPage(client, createObjectUrl);
  } catch {
    app.innerHTML = renderStatus("error", "公开页暂时无法读取");
  }
}

function browserDocument(): BrowserDocument | null {
  if (typeof globalThis !== "object") {
    return null;
  }
  const candidate = (globalThis as { document?: unknown }).document;
  if (typeof candidate !== "object" || candidate === null || !("querySelector" in candidate)) {
    return null;
  }
  const query: unknown = candidate.querySelector;
  if (typeof query !== "function") {
    return null;
  }
  return {
    querySelector(selector: string): MountPoint | null {
      const node: unknown = query.call(candidate, selector);
      if (!isMountPoint(node)) {
        return null;
      }
      return node;
    },
  };
}

function isMountPoint(value: unknown): value is MountPoint {
  return (
    typeof value === "object" &&
    value !== null &&
    "innerHTML" in value &&
    typeof value.innerHTML === "string"
  );
}

function browserObjectUrl(): ObjectUrlFactory | null {
  if (typeof URL.createObjectURL !== "function") {
    return null;
  }
  const create = URL.createObjectURL.bind(URL);
  return (bytes, mediaType) => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return create(new Blob([copy.buffer], { type: mediaType }));
  };
}

const documentRef = browserDocument();
const createObjectUrl = browserObjectUrl();
if (documentRef !== null && createObjectUrl !== null) {
  void mountOriginalPage(documentRef, createPublicClient(), createObjectUrl);
}
