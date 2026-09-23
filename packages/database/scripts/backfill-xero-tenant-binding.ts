import { parseArgs } from "node:util";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";
import { PrismaClient } from "../generated/client";
import { isLocalDatabase } from "../src/is-local-database";
import { planXeroTenantBindingBackfill } from "../src/xero-tenant-binding-backfill";

const { values } = parseArgs({
  options: {
    apply: { type: "boolean" },
    "dry-run": { type: "boolean" },
    "provider-app-id": { type: "string" },
  },
  strict: true,
});

const providerAppId = values["provider-app-id"]?.trim();
const databaseUrl = process.env.DATABASE_URL;
if (!(providerAppId && databaseUrl) || (values.apply && values["dry-run"])) {
  process.stderr.write(
    "Usage: bun run backfill:xero-tenant-binding --provider-app-id <value> [--dry-run|--apply]\nDATABASE_URL must be exported.\n"
  );
  process.exit(1);
}

if (!isLocalDatabase(databaseUrl)) {
  neonConfig.webSocketConstructor = ws;
}
const adapter = isLocalDatabase(databaseUrl)
  ? new PrismaPg({ connectionString: databaseUrl })
  : new PrismaNeon({ connectionString: databaseUrl });
const database = new PrismaClient({ adapter });

try {
  const rows: Parameters<typeof planXeroTenantBindingBackfill>[0][number][] =
    [];
  let cursor: string | undefined;
  for (;;) {
    const page = await database.xeroTenant.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: {
        active_slot: true,
        id: true,
        organisation_id: true,
        provider_app_id: true,
        xero_connection: { select: { status: true } },
        xero_tenant_id: true,
      },
      take: 500,
    });
    for (const row of page) {
      rows.push({
        active_slot: row.active_slot,
        connection_status: row.xero_connection.status,
        id: row.id,
        organisation_id: row.organisation_id,
        provider_app_id: row.provider_app_id,
        xero_tenant_id: row.xero_tenant_id,
      });
    }
    if (page.length < 500) {
      break;
    }
    cursor = page.at(-1)?.id;
  }

  const plan = planXeroTenantBindingBackfill(rows, providerAppId);
  process.stdout.write(
    `${values.apply ? "Apply" : "Dry run"}: ${rows.length} rows, ${plan.updates.length} updates, ${plan.collisions.length} collisions\n`
  );
  for (const collision of plan.collisions) {
    process.stdout.write(
      `xero_tenant_id=${collision.xero_tenant_id} count=${collision.organisation_ids.length} organisation_ids=${collision.organisation_ids.join(",")}\n`
    );
  }
  if (plan.collisions.length > 0) {
    process.exitCode = 2;
  } else if (values.apply) {
    for (let offset = 0; offset < plan.updates.length; offset += 500) {
      const page = plan.updates.slice(offset, offset + 500);
      await database.$transaction(
        page.map((update) =>
          database.xeroTenant.update({
            data: {
              active_slot: update.active_slot,
              provider_app_id: update.provider_app_id,
            },
            where: { id: update.id },
          })
        )
      );
    }
  }
} finally {
  await database.$disconnect();
}
