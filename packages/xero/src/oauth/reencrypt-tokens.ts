import type { Result } from "@repo/core";
import { systemDatabase, withXeroGrantLock } from "@repo/database";
import {
  activeXeroKeyVersion,
  resolveXeroEncryptionKey,
} from "../crypto/keyring";
import { encryptXeroToken, tryDecryptXeroToken } from "../crypto/tokens";
// Internal system maintenance; no customer data is returned.
export async function reencryptXeroTokens(input: {
  batchSize: number;
  only?: { authorisationIds?: string[] };
}): Promise<
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
    const where = input.only
      ? { id: { in: input.only.authorisationIds ?? [] } }
      : {};
    const versions = await systemDatabase.xeroAuthorisation.findMany({
      distinct: "token_key_version",
      select: { token_key_version: true },
      where,
    });
    if (
      versions.some(
        (row) => !resolveXeroEncryptionKey(row.token_key_version).ok
      )
    ) {
      return { error: { code: "unknown_key_version_present" }, ok: false };
    }
    const counts = { failed: 0, rewritten: 0, skipped: 0 };
    let cursor: string | undefined;
    for (;;) {
      const grants = await systemDatabase.xeroAuthorisation.findMany({
        orderBy: { id: "asc" },
        take: input.batchSize,
        where: {
          ...where,
          ...(cursor
            ? {
                id: {
                  ...(input.only
                    ? { in: input.only.authorisationIds ?? [] }
                    : {}),
                  gt: cursor,
                },
              }
            : {}),
          token_key_version: { not: active },
        },
      });
      if (!grants.length) {
        break;
      }
      for (const grant of grants) {
        cursor = grant.id;
        await withXeroGrantLock(
          {
            deadlineAt: Date.now() + 15_000,
            mode: "refresh",
            providerAppId: grant.provider_app_id,
            xeroUserId: grant.xero_user_id,
          },
          async (tx) => {
            const current = await tx.xeroAuthorisation.findUnique({
              where: { id: grant.id },
            });
            if (!current || current.token_key_version === active) {
              counts.skipped += 1;
              return;
            }
            const access = tryDecryptXeroToken({
              authTag: current.access_token_auth_tag,
              encrypted: current.access_token_encrypted,
              iv: current.access_token_iv,
              keyVersion: current.token_key_version,
            });
            const refresh = tryDecryptXeroToken({
              authTag: current.refresh_token_auth_tag,
              encrypted: current.refresh_token_encrypted,
              iv: current.refresh_token_iv,
              keyVersion: current.token_key_version,
            });
            if (!(access.ok && refresh.ok)) {
              counts.failed += 1;
              return;
            }
            const a = encryptXeroToken(access.token),
              r = encryptXeroToken(refresh.token);
            await tx.xeroAuthorisation.update({
              data: {
                access_token_auth_tag: a.authTag,
                access_token_encrypted: a.encrypted,
                access_token_iv: a.iv,
                refresh_token_auth_tag: r.authTag,
                refresh_token_encrypted: r.encrypted,
                refresh_token_iv: r.iv,
                token_encrypted_at: a.encryptedAt,
                token_key_version: a.keyVersion,
              },
              where: { id: current.id },
            });
            counts.rewritten += 1;
          }
        );
      }
    }
    return { ok: true, value: counts };
  } catch {
    return { error: { code: "database_error" }, ok: false };
  }
}
