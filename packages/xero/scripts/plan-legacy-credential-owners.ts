import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { database } from "@repo/database";
import {
  captureXeroCredentialIdentitySnapshot,
  type XeroCredentialIdentitySnapshot,
  xeroCredentialIdentityArtifactSchema,
} from "@repo/database/xero-credential-identity-artifact";
import { keys } from "../keys";
import { decryptXeroToken } from "../src/crypto/tokens";
import { verifyLegacyXeroAccessTokenIdentity } from "../src/oauth/identity";

const { values } = parseArgs({
  options: { out: { type: "string" } },
  strict: true,
});
const databaseUrl = process.env.DATABASE_URL;
if (!(values.out && databaseUrl)) {
  process.stderr.write(
    "Usage: bun run plan:legacy-credential-owners --out <path>\nDATABASE_URL must be exported.\n"
  );
  process.exit(1);
}
async function main(out: string) {
  try {
    const providerAppId = keys().XERO_CLIENT_ID;
    if (!providerAppId) {
      throw new Error("Xero provider app is required for identity planning.");
    }
    const identities: XeroCredentialIdentitySnapshot[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await database.xeroTenant.findMany({
        where: {
          active_slot: 1,
          provider_app_id: providerAppId,
          retired_at: null,
        },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "asc" },
        select: {
          binding_generation: true,
          clerk_org_id: true,
          id: true,
          organisation_id: true,
          provider_app_id: true,
          xero_connection: {
            select: {
              access_token_auth_tag: true,
              access_token_encrypted: true,
              access_token_iv: true,
              expires_at: true,
              refresh_token_auth_tag: true,
              refresh_token_encrypted: true,
              refresh_token_iv: true,
              token_key_version: true,
            },
          },
          xero_connection_id: true,
        },
        take: 500,
      });
      for (const row of page) {
        let xeroUserId: string | null = null;
        try {
          const connection = row.xero_connection;
          const accessToken = decryptXeroToken({
            authTag: connection.access_token_auth_tag,
            encrypted: connection.access_token_encrypted,
            iv: connection.access_token_iv,
            keyVersion: connection.token_key_version,
          });
          const identity =
            await verifyLegacyXeroAccessTokenIdentity(accessToken);
          if (identity.ok) {
            ({ xeroUserId } = identity.value);
          }
        } catch {
          // Unverifiable rows remain unowned. Never include token material in the report.
        }
        identities.push(captureXeroCredentialIdentitySnapshot(row, xeroUserId));
      }
      if (page.length < 500) {
        break;
      }
      cursor = page.at(-1)?.id;
    }
    await writeFile(
      out,
      `${JSON.stringify(xeroCredentialIdentityArtifactSchema.parse({ entries: identities, providerAppId, version: 1 }), null, 2)}\n`,
      {
        flag: "wx",
        mode: 0o600,
      }
    );
    process.stdout.write(
      `Identity plan written: ${identities.length} bindings, ${identities.filter((row) => row.xeroUserId === null).length} unverifiable.\n`
    );
  } catch {
    process.stderr.write(
      "Unable to write the legacy credential identity plan.\n"
    );
    process.exitCode = 1;
  } finally {
    await database.$disconnect();
  }
}
main(values.out).catch(() => {
  process.stderr.write("Legacy credential identity planning failed.\n");
  process.exitCode = 1;
});
