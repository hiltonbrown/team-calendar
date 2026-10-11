import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { isLocalDatabase } from "./src/is-local-database";
import { systemDatabase } from "./src/system-client";

const ownerUrl = process.env.DATABASE_URL;
if (!(ownerUrl && isLocalDatabase(ownerUrl))) {
  throw new Error(
    "Multi-company database fixtures require disposable local PostgreSQL"
  );
}

const migration = readFileSync(
  new URL(
    "./prisma/migrations/20261010010000_xero_multi_company/migration.sql",
    import.meta.url
  ),
  "utf8"
);
const backfill = migration.slice(
  migration.indexOf("UPDATE feeds f SET organisation_id = NULL")
);

test("default feed backfill preserves feed/token identities and company custom feeds", async () => {
  await systemDatabase
    .$transaction(async (tx) => {
      const account = `backfill-${randomUUID()}`;
      const company = await tx.organisation.create({
        data: { clerk_org_id: account, country_code: "AU", name: "Payroll" },
      });
      const feed = await tx.feed.create({
        data: {
          clerk_org_id: account,
          name: "All staff",
          organisation_id: company.id,
          slug: "all-staff",
        },
      });
      const custom = await tx.feed.create({
        data: {
          clerk_org_id: account,
          name: "My team",
          organisation_id: company.id,
          slug: "my-team",
        },
      });
      const token = await tx.feedToken.create({
        data: {
          clerk_org_id: account,
          feed_id: feed.id,
          organisation_id: company.id,
          token_hash: randomUUID(),
          token_hint: "hint",
        },
      });
      const scope = await tx.feedScope.create({
        data: {
          clerk_org_id: account,
          feed_id: feed.id,
          organisation_id: company.id,
          scope_type: "org",
        },
      });
      const publication = await tx.feedEventPublication.create({
        data: {
          clerk_org_id: account,
          feed_id: feed.id,
          organisation_id: company.id,
          published_at: new Date(),
          published_uid: "unchanged-uid",
          representation_hash: "representation",
          source_key: "record:one",
        },
      });
      await tx.auditEvent.create({
        data: {
          action: "feeds.created",
          clerk_org_id: account,
          organisation_id: company.id,
          payload: { defaultFeed: true },
          resource_id: feed.id,
          resource_type: "feed",
        },
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        for (const statement of backfill
          .split(";")
          .map((sql) => sql.trim())
          .filter(Boolean)) {
          await tx.$executeRawUnsafe(statement);
        }
      }
      expect(await tx.feed.findUnique({ where: { id: feed.id } })).toEqual({
        ...feed,
        organisation_id: null,
      });
      expect(
        await tx.feedToken.findUnique({ where: { id: token.id } })
      ).toEqual({ ...token, organisation_id: null });
      expect(
        await tx.feedScope.findUnique({ where: { id: scope.id } })
      ).toEqual({ ...scope, organisation_id: null });
      expect(
        await tx.feedEventPublication.findUnique({
          where: { id: publication.id },
        })
      ).toEqual({ ...publication, organisation_id: null });
      expect(await tx.feed.findUnique({ where: { id: custom.id } })).toEqual(
        custom
      );
      throw new Error("backfill fixture rollback");
    })
    .catch((error: unknown) => {
      if (
        !(error instanceof Error) ||
        error.message !== "backfill fixture rollback"
      ) {
        throw error;
      }
    });
});

test("deployment upgrades the persisted Premium payroll limit to five idempotently", async () => {
  await systemDatabase
    .$transaction(async (tx) => {
      const plan =
        (await tx.plan.findFirst({
          where: { OR: [{ plan_key: "premium" }, { key: "premium" }] },
        })) ??
        (await tx.plan.create({
          data: { key: "premium", name: "Premium", plan_key: "premium" },
        }));
      const original = await tx.planLimit.upsert({
        create: {
          limit_type: "payroll_entities",
          limit_value: 1,
          plan_id: plan.id,
        },
        update: { limit_value: 1 },
        where: {
          plan_id_limit_type: {
            limit_type: "payroll_entities",
            plan_id: plan.id,
          },
        },
      });
      const pricingBackfill = migration.slice(
        migration.indexOf("UPDATE plan_limits limits SET limit_value = 5")
      );
      await tx.$executeRawUnsafe(pricingBackfill);
      const updated = await tx.planLimit.findUnique({
        where: { id: original.id },
      });
      expect(updated?.limit_value).toBe(5);
      await tx.$executeRawUnsafe(pricingBackfill);
      expect(
        await tx.planLimit.findUnique({ where: { id: original.id } })
      ).toEqual(updated);
      throw new Error("premium fixture rollback");
    })
    .catch((error: unknown) => {
      if (
        !(error instanceof Error) ||
        error.message !== "premium fixture rollback"
      ) {
        throw error;
      }
    });
});
