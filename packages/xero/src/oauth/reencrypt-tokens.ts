import type { Result } from "@repo/core";
import { database } from "@repo/database";
import { log } from "@repo/observability/log";
import {
  activeXeroKeyVersion,
  resolveXeroEncryptionKey,
} from "../crypto/keyring";
import { encryptXeroToken, tryDecryptXeroToken } from "../crypto/tokens";

type Table = "connection" | "session" | "owner" | "attempt";
type LegacyTable = "connection" | "session";
interface TargetRestriction {
  attemptIds?: string[];
  connectionIds?: string[];
  ownerIds?: string[];
  sessionIds?: string[];
}
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
    only?: TargetRestriction;
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
    const tables: LegacyTable[] = ["connection", "session"];
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
    const ownerWhere = input.only
      ? { id: { in: input.only.ownerIds ?? [] } }
      : {};
    const attemptWhere = {
      ...(input.only ? { id: { in: input.only.attemptIds ?? [] } } : {}),
      recovery_key_version: { not: null },
    };
    const ownerVersions = await database.xeroCredentialOwner.findMany({
      distinct: "token_key_version",
      select: { token_key_version: true },
      where: ownerWhere,
    });
    const attemptVersions = await database.xeroRefreshAttempt.findMany({
      distinct: "recovery_key_version",
      select: { recovery_key_version: true },
      where: attemptWhere,
    });
    if (
      ownerVersions.some(
        (row) => !resolveXeroEncryptionKey(row.token_key_version).ok
      ) ||
      attemptVersions.some(
        (row) =>
          row.recovery_key_version !== null &&
          !resolveXeroEncryptionKey(row.recovery_key_version).ok
      )
    ) {
      return { error: { code: "unknown_key_version_present" }, ok: false };
    }
    const counts = { failed: 0, rewritten: 0, skipped: 0 };
    for (const table of tables) {
      await rewriteTable(input, table, active, counts, deps);
    }
    await rewriteOwners(input, active, counts, deps);
    await rewriteAttempts(input, active, counts, deps);
    return { ok: true, value: counts };
  } catch {
    return { error: { code: "database_error" }, ok: false };
  }
}

async function rewriteTable(
  input: {
    batchSize: number;
    only?: TargetRestriction;
  },
  table: LegacyTable,
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

function restriction(input: { only?: TargetRestriction }, table: LegacyTable) {
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

async function rewriteOwners(
  input: { batchSize: number; only?: TargetRestriction },
  active: number,
  counts: { rewritten: number; skipped: number; failed: number },
  deps?: { beforeWrite?: (table: Table, id: string) => Promise<void> }
) {
  let cursor: string | undefined;
  for (;;) {
    const rows = await database.xeroCredentialOwner.findMany({
      orderBy: { id: "asc" },
      take: input.batchSize,
      where: {
        id: {
          ...(input.only ? { in: input.only.ownerIds ?? [] } : {}),
          ...(cursor ? { gt: cursor } : {}),
        },
        token_key_version: { not: active },
      },
    });
    if (!rows.length) {
      break;
    }
    for (const row of rows) {
      cursor = row.id;
      const rewritten = reencryptRow(row);
      if (
        !(
          rewritten?.access_token_auth_tag &&
          rewritten.access_token_iv &&
          rewritten.refresh_token_auth_tag &&
          rewritten.refresh_token_iv
        )
      ) {
        counts.failed += 1;
        continue;
      }
      const { token_encrypted_at: _encryptedAt, ...envelope } = rewritten;
      await deps?.beforeWrite?.("owner", row.id);
      const result = await database.xeroCredentialOwner.updateMany({
        data: {
          ...envelope,
          access_token_auth_tag: rewritten.access_token_auth_tag,
          access_token_iv: rewritten.access_token_iv,
          refresh_token_auth_tag: rewritten.refresh_token_auth_tag,
          refresh_token_iv: rewritten.refresh_token_iv,
        },
        where: {
          access_token_auth_tag: row.access_token_auth_tag,
          access_token_encrypted: row.access_token_encrypted,
          access_token_iv: row.access_token_iv,
          id: row.id,
          refresh_token_auth_tag: row.refresh_token_auth_tag,
          refresh_token_encrypted: row.refresh_token_encrypted,
          refresh_token_iv: row.refresh_token_iv,
          token_key_version: row.token_key_version,
          token_version: row.token_version,
        },
      });
      counts[result.count ? "rewritten" : "skipped"] += 1;
    }
    if (rows.length < input.batchSize) {
      break;
    }
  }
}
async function rewriteAttempts(
  input: { batchSize: number; only?: TargetRestriction },
  active: number,
  counts: { rewritten: number; skipped: number; failed: number },
  deps?: { beforeWrite?: (table: Table, id: string) => Promise<void> }
) {
  let cursor: string | undefined;
  for (;;) {
    const rows = await database.xeroRefreshAttempt.findMany({
      orderBy: { id: "asc" },
      take: input.batchSize,
      where: {
        id: attemptIds(input.only, cursor),
        recovery_key_version: { not: active },
      },
    });
    if (!rows.length) {
      break;
    }
    for (const row of rows) {
      cursor = row.id;
      if (!hasRecoveryEnvelope(row)) {
        counts.failed += 1;
        continue;
      }
      const token = tryDecryptXeroToken({
        authTag: row.recovery_token_auth_tag,
        encrypted: row.recovery_token_encrypted,
        iv: row.recovery_token_iv,
        keyVersion: row.recovery_key_version,
      });
      if (!(token.ok && token.token)) {
        counts.failed += 1;
        continue;
      }
      const encrypted = encryptXeroToken(token.token);
      await deps?.beforeWrite?.("attempt", row.id);
      const result = await database.xeroRefreshAttempt.updateMany({
        data: {
          recovery_key_version: encrypted.keyVersion,
          recovery_token_auth_tag: encrypted.authTag,
          recovery_token_encrypted: encrypted.encrypted,
          recovery_token_iv: encrypted.iv,
        },
        where: {
          expected_token_version: row.expected_token_version,
          id: row.id,
          outcome: row.outcome,
          recovery_key_version: row.recovery_key_version,
          recovery_token_auth_tag: row.recovery_token_auth_tag,
          recovery_token_encrypted: row.recovery_token_encrypted,
          recovery_token_iv: row.recovery_token_iv,
        },
      });
      counts[result.count ? "rewritten" : "skipped"] += 1;
    }
    if (rows.length < input.batchSize) {
      break;
    }
  }
}

function hasRecoveryEnvelope<
  T extends {
    recovery_key_version: number | null;
    recovery_token_encrypted: string | null;
  },
>(
  row: T
): row is T & {
  recovery_key_version: number;
  recovery_token_encrypted: string;
} {
  return (
    row.recovery_key_version !== null && row.recovery_token_encrypted !== null
  );
}

function attemptIds(
  only: TargetRestriction | undefined,
  cursor: string | undefined
) {
  return {
    ...(only ? { in: only.attemptIds ?? [] } : {}),
    ...(cursor ? { gt: cursor } : {}),
  };
}
