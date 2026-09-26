import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";
import { z } from "zod";
import { PrismaClient } from "../generated/client";
import { isLocalDatabase } from "../src/is-local-database";
import { planXeroCredentialOwnerBackfill } from "../src/xero-credential-owner-backfill";

const { values } = parseArgs({
  options: {
    apply: { type: "boolean" },
    "dry-run": { type: "boolean" },
    identities: { type: "string" },
    "provider-app-id": { type: "string" },
  },
  strict: true,
});
const providerAppId = values["provider-app-id"]?.trim();
const databaseUrl = process.env.DATABASE_URL;
if (
  !(providerAppId && databaseUrl && values.identities) ||
  (values.apply && values["dry-run"])
) {
  process.stderr.write(
    "Usage: backfill:xero-credential-owner --identities <path> --provider-app-id <id> [--dry-run|--apply]\nDATABASE_URL must be exported.\n"
  );
  process.exit(1);
}
const identities = z
  .array(
    z
      .object({ tenantId: z.uuid(), xeroUserId: z.string().min(1).nullable() })
      .strict()
  )
  .parse(JSON.parse(await readFile(values.identities, "utf8")));
if (!isLocalDatabase(databaseUrl)) {
  neonConfig.webSocketConstructor = ws;
}
const database = new PrismaClient({
  adapter: isLocalDatabase(databaseUrl)
    ? new PrismaPg({ connectionString: databaseUrl })
    : new PrismaNeon({ connectionString: databaseUrl }),
});
try {
  const rows = await database.xeroTenant.findMany({
    select: {
      active_slot: true,
      id: true,
      provider_app_id: true,
      xero_credential_owner_id: true,
    },
    where: { active_slot: 1, provider_app_id: providerAppId },
  });
  const owners = await database.xeroCredentialOwner.findMany({
    select: { id: true, provider_app_id: true, xero_user_id: true },
    where: { provider_app_id: providerAppId },
  });
  const plan = planXeroCredentialOwnerBackfill(
    rows,
    identities,
    providerAppId,
    owners
  );
  process.stdout.write(
    `${values.apply ? "Apply" : "Dry run"}: ${plan.attachments.length} attachments, ${plan.groups.length} shared groups, ${plan.unverifiableTenantIds.length} unverifiable bindings\n`
  );
  for (const group of plan.groups) {
    process.stdout.write(
      `Shared group: tenant_ids=${group.tenantIds.join(",")}\n`
    );
  }
  for (const tenantId of plan.unverifiableTenantIds) {
    process.stdout.write(`Unverifiable: tenant_id=${tenantId}\n`);
  }
  if (values.apply) {
    for (const attachment of plan.attachments) {
      await database.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5000ms'");
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-owner:${providerAppId}:${attachment.xeroUserId}`}, 0))::text AS acquired`;
        const currentOwner = await tx.xeroCredentialOwner.findUnique({
          where: {
            provider_app_id_xero_user_id: {
              provider_app_id: providerAppId,
              xero_user_id: attachment.xeroUserId,
            },
          },
        });
        const ownerId = currentOwner?.id ?? randomUUID();
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-owner:${ownerId}`}, 0))::text AS acquired`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-binding:${attachment.tenantId}`}, 0))::text AS acquired`;
        const binding = await tx.xeroTenant.findFirst({
          include: { xero_connection: true },
          where: {
            active_slot: 1,
            id: attachment.tenantId,
            provider_app_id: providerAppId,
            xero_credential_owner_id: null,
          },
        });
        if (!binding) {
          return;
        }
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${binding.xero_connection_id}, 0))::text AS acquired`;
        const connection = await tx.xeroConnection.findUniqueOrThrow({
          where: { id: binding.xero_connection_id },
        });
        if (
          connection.status === "disconnected" ||
          connection.disconnected_at ||
          connection.revoked_at
        ) {
          return;
        }
        const envelope = z
          .object({
            access_token_auth_tag: z.string().min(1),
            access_token_encrypted: z.string().min(1),
            access_token_iv: z.string().min(1),
            refresh_token_auth_tag: z.string().min(1),
            refresh_token_encrypted: z.string().min(1),
            refresh_token_iv: z.string().min(1),
          })
          .parse(connection);
        const owner = await tx.xeroCredentialOwner.upsert({
          create: {
            id: ownerId,
            identity_evidence: "legacy_access_token_jwt",
            provider_app_id: providerAppId,
            xero_user_id: attachment.xeroUserId,
            ...envelope,
            granted_scopes: [],
            granted_scopes_known: false,
            last_verified_at: new Date(),
            token_expires_at: connection.expires_at,
            token_key_version: connection.token_key_version,
            usability: "usable",
          },
          update: {},
          where: {
            provider_app_id_xero_user_id: {
              provider_app_id: providerAppId,
              xero_user_id: attachment.xeroUserId,
            },
          },
        });
        // A concurrent adoption must be retried under its actual owner lock.
        if (owner.id !== ownerId) {
          throw new Error(
            "Credential owner changed during backfill; rerun planning"
          );
        }
        const remaining = await tx.xeroTenant.count({
          where: {
            active_slot: 1,
            id: {
              in: identities
                .filter(
                  (identity) => identity.xeroUserId === attachment.xeroUserId
                )
                .map((identity) => identity.tenantId),
            },
            provider_app_id: providerAppId,
          },
        });
        if (remaining !== 1) {
          throw new Error(
            "Shared binding group changed during backfill; rerun planning"
          );
        }
        await tx.xeroTenant.update({
          data: { xero_credential_owner_id: owner.id },
          where: {
            clerk_org_id: binding.clerk_org_id,
            id: binding.id,
            organisation_id: binding.organisation_id,
          },
        });
        await tx.xeroConnection.update({
          data: {
            access_token_auth_tag: owner.access_token_auth_tag,
            access_token_encrypted: owner.access_token_encrypted,
            access_token_iv: owner.access_token_iv,
            expires_at: owner.token_expires_at,
            last_refreshed_at:
              owner.last_rotated_at ?? connection.last_refreshed_at,
            refresh_token_auth_tag: owner.refresh_token_auth_tag,
            refresh_token_encrypted: owner.refresh_token_encrypted,
            refresh_token_iv: owner.refresh_token_iv,
            token_encrypted_at: new Date(),
            token_key_version: owner.token_key_version,
          },
          where: {
            clerk_org_id: connection.clerk_org_id,
            id: connection.id,
            organisation_id: connection.organisation_id,
          },
        });
      });
    }
  }
} finally {
  await database.$disconnect();
}
