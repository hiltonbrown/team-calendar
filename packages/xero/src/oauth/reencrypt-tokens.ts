import type { Result } from "@repo/core";
import { database } from "@repo/database";
import { log } from "@repo/observability/log";
import {
  activeXeroKeyVersion,
  resolveXeroEncryptionKey,
} from "../crypto/keyring";
import { encryptXeroToken, tryDecryptXeroToken } from "../crypto/tokens";

type Table = "connection" | "session";
interface CiphertextRow {
  access_token_auth_tag: null | string;
  access_token_encrypted: string;
  access_token_iv: null | string;
  id: string;
  refresh_token_auth_tag: null | string;
  refresh_token_encrypted: string;
  refresh_token_iv: null | string;
  token_key_version: number;
}

// System maintenance intentionally spans tenants. Never expose this operation to apps.
export async function reencryptXeroTokens(
  input: {
    batchSize: number;
    only?: { connectionIds?: string[]; sessionIds?: string[] };
  },
  deps?: { beforeWrite?: (table: Table, id: string) => Promise<void> }
): Promise<
  Result<
    { rewritten: number; skipped: number; failed: number },
    { code: "unknown_key_version_present" | "database_error" }
  >
> {
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1) {
    return { error: { code: "database_error" }, ok: false };
  }
  try {
    const active = activeXeroKeyVersion();
    const tables: Table[] = ["connection", "session"];
    // Preflight both complete target sets before performing even one write.
    for (const table of tables) {
      const where = restriction(input, table);
      const query = {
        distinct: "token_key_version",
        select: { token_key_version: true },
        where,
      } as const;
      const versions =
        table === "connection"
          ? await database.xeroConnection.findMany(query)
          : await database.xeroOAuthSession.findMany(query);
      if (
        versions.some(
          (row) => !resolveXeroEncryptionKey(row.token_key_version).ok
        )
      ) {
        return { error: { code: "unknown_key_version_present" }, ok: false };
      }
    }
    const counts = { failed: 0, rewritten: 0, skipped: 0 };
    for (const table of tables) {
      await rewriteTable(input, table, active, counts, deps);
    }
    return { ok: true, value: counts };
  } catch {
    return { error: { code: "database_error" }, ok: false };
  }
}

async function rewriteTable(
  input: {
    batchSize: number;
    only?: { connectionIds?: string[]; sessionIds?: string[] };
  },
  table: Table,
  active: number,
  counts: { rewritten: number; skipped: number; failed: number },
  deps?: { beforeWrite?: (table: Table, id: string) => Promise<void> }
) {
  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const query = {
      orderBy: { id: "asc" },
      take: input.batchSize,
      where: {
        ...restriction(input, table),
        ...(cursor
          ? { id: { ...restriction(input, table).id, gt: cursor } }
          : {}),
        token_key_version: { not: active },
      },
    } as const;
    const rows =
      table === "connection"
        ? await database.xeroConnection.findMany(query)
        : await database.xeroOAuthSession.findMany(query);
    if (!rows.length) {
      break;
    }
    hasMore = rows.length === input.batchSize;
    for (const row of rows) {
      cursor = row.id;
      const data = reencryptRow(row);
      if (!data) {
        counts.failed += 1;
        log.warn("Xero token re-encryption failed", { id: row.id });
        continue;
      }
      await deps?.beforeWrite?.(table, row.id);
      const where = {
        access_token_auth_tag: row.access_token_auth_tag,
        access_token_encrypted: row.access_token_encrypted,
        access_token_iv: row.access_token_iv,
        id: row.id,
        refresh_token_auth_tag: row.refresh_token_auth_tag,
        refresh_token_encrypted: row.refresh_token_encrypted,
        refresh_token_iv: row.refresh_token_iv,
        token_key_version: row.token_key_version,
      };
      const result =
        table === "connection"
          ? await database.xeroConnection.updateMany({ data, where })
          : await database.xeroOAuthSession.updateMany({ data, where });
      counts[result.count ? "rewritten" : "skipped"] += 1;
    }
  }
}

function restriction(
  input: { only?: { connectionIds?: string[]; sessionIds?: string[] } },
  table: Table
) {
  return input.only
    ? {
        id: {
          in:
            (table === "connection"
              ? input.only.connectionIds
              : input.only.sessionIds) ?? [],
        },
      }
    : {};
}

function reencryptRow(row: CiphertextRow) {
  const access = tryDecryptXeroToken({
    authTag: row.access_token_auth_tag,
    encrypted: row.access_token_encrypted,
    iv: row.access_token_iv,
    keyVersion: row.token_key_version,
  });
  const refresh = tryDecryptXeroToken({
    authTag: row.refresh_token_auth_tag,
    encrypted: row.refresh_token_encrypted,
    iv: row.refresh_token_iv,
    keyVersion: row.token_key_version,
  });
  if (!(access.ok && refresh.ok)) {
    return null;
  }
  const a = access.token ? encryptXeroToken(access.token) : null;
  const r = refresh.token ? encryptXeroToken(refresh.token) : null;
  return {
    access_token_auth_tag: a?.authTag ?? null,
    access_token_encrypted: a?.encrypted ?? "",
    access_token_iv: a?.iv ?? null,
    refresh_token_auth_tag: r?.authTag ?? null,
    refresh_token_encrypted: r?.encrypted ?? "",
    refresh_token_iv: r?.iv ?? null,
    token_encrypted_at: a?.encryptedAt ?? r?.encryptedAt ?? null,
    token_key_version: activeXeroKeyVersion(),
  };
}
