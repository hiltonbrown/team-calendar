import { z } from "zod";
import { parseXeroExecutionManifest } from "./xero-execution-guard.js";

const TRAILING_SLASHES = /\/+$/;
const TOKEN_NEWLINE = /[\r\n]/;
const MAX_TIMEOUT_MS = 15_000;
const envelopeSchema = z.strictObject({ result: z.string().nullable() });

export interface XeroExecutionManifestStoreInput {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  token: string;
  url: string;
}

interface PreparedManifest {
  canonical: string;
  key: string;
}

// Object member order is irrelevant; every array retains its declared order.
function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  ) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`
      )
      .join(",")}}`;
  }
  throw new Error("Xero manifest contains a non-JSON value");
}

function prepareManifest(
  value: unknown,
  source: "local" | "durable"
): PreparedManifest {
  try {
    const manifest = parseXeroExecutionManifest(value);
    return {
      canonical: canonicalJson(manifest),
      key: `xero:e2e:manifest:${manifest.runId}`,
    };
  } catch {
    // biome-ignore lint/style/useErrorCause: Raw causes can expose configuration, validation inputs or provider secrets.
    throw new Error(`Protected Xero ${source} manifest is invalid`);
  }
}

function prepareStore(input: XeroExecutionManifestStoreInput) {
  try {
    const url = new URL(input.url);
    const timeoutMs = input.timeoutMs ?? 10_000;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !input.token.trim() ||
      TOKEN_NEWLINE.test(input.token) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > MAX_TIMEOUT_MS
    ) {
      throw new Error("Invalid store configuration");
    }
    return {
      fetchImpl: input.fetchImpl ?? fetch,
      timeoutMs,
      token: input.token,
      url: url.href.replace(TRAILING_SLASHES, ""),
    };
  } catch {
    // biome-ignore lint/style/useErrorCause: Raw causes can expose configuration, validation inputs or provider secrets.
    throw new Error("Durable Xero manifest KV configuration is invalid");
  }
}

type PreparedStore = ReturnType<typeof prepareStore>;

async function request(
  store: PreparedStore,
  operation: "persistence" | "read-back",
  path: string,
  init: RequestInit
): Promise<string | null> {
  try {
    const response = await store.fetchImpl(`${store.url}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${store.token}`,
        "Content-Type": "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(store.timeoutMs),
    });
    if (!response.ok) {
      throw new Error("Store request failed");
    }
    return envelopeSchema.parse(await response.json()).result;
  } catch {
    // Provider errors and validation issues can contain URLs or credentials.
    // biome-ignore lint/style/useErrorCause: Raw causes can expose configuration, validation inputs or provider secrets.
    throw new Error(`Durable Xero manifest ${operation} failed`);
  }
}

async function assertReadBack(
  local: PreparedManifest,
  store: PreparedStore
): Promise<void> {
  const result = await request(
    store,
    "read-back",
    `/get/${encodeURIComponent(local.key)}`,
    { method: "GET" }
  );
  if (result === null) {
    throw new Error("Durable Xero manifest is missing");
  }
  let value: unknown;
  try {
    value = JSON.parse(result);
  } catch {
    // biome-ignore lint/style/useErrorCause: Raw causes can expose configuration, validation inputs or provider secrets.
    throw new Error("Protected Xero durable manifest is invalid");
  }
  const durable = prepareManifest(value, "durable");
  if (durable.canonical !== local.canonical) {
    throw new Error(
      "Durable Xero manifest does not match the local protected copy"
    );
  }
}

/** Persistence proves only manifest identity, never worker isolation or admission. */
export async function persistXeroExecutionManifest(
  manifest: unknown,
  input: XeroExecutionManifestStoreInput
): Promise<void> {
  const local = prepareManifest(manifest, "local");
  const store = prepareStore(input);
  const result = await request(store, "persistence", "", {
    body: JSON.stringify(["SET", local.key, local.canonical, "NX"]),
    method: "POST",
  });
  if (result === null) {
    throw new Error("Durable Xero manifest namespace already exists");
  }
  if (result !== "OK") {
    throw new Error("Durable Xero manifest persistence failed");
  }
  await assertReadBack(local, store);
}

export async function assertDurableXeroExecutionManifestReadBack(
  manifest: unknown,
  input: XeroExecutionManifestStoreInput
): Promise<void> {
  await assertReadBack(prepareManifest(manifest, "local"), prepareStore(input));
}
