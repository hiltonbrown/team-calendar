import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { database } from "../src/client";
import { applyVerifiedXeroCredentialOwnerAttachment } from "../src/queries/xero-credential-owner";
import { xeroCredentialIdentityArtifactSchema } from "../src/xero-credential-identity-artifact";
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
const parsedArtifact = xeroCredentialIdentityArtifactSchema.safeParse(
  JSON.parse(await readFile(values.identities, "utf8"))
);
if (
  !parsedArtifact.success ||
  parsedArtifact.data.providerAppId !== providerAppId
) {
  process.stderr.write(
    "A current versioned identity artefact for the configured provider app is required.\n"
  );
  process.exit(1);
}
const identities = parsedArtifact.data.entries;
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
      const identity = identities.find(
        (entry) => entry.tenantId === attachment.tenantId
      );
      if (!identity) {
        throw new Error(
          "Verified credential identity is missing; regenerate the identity plan."
        );
      }
      const applied = await applyVerifiedXeroCredentialOwnerAttachment({
        identity,
        identityGroup: identities.filter(
          (entry) => entry.xeroUserId === attachment.xeroUserId
        ),
        providerAppId,
      });
      if (!applied.ok) {
        throw new Error(applied.error.message);
      }
    }
  }
} finally {
  await database.$disconnect();
}
