import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";
import { systemDatabase } from "./src/system-client";

const fixture = allocateLiveTestFixture(
  "packages/database/multi-company-migration.integration.test.ts"
);
const [tenant] = fixture.tenants;
if (!tenant) {
  throw new Error("Multi-company migration fixture account is missing");
}

const migration = readFileSync(
  new URL(
    "./prisma/migrations/20261010010000_xero_multi_company/migration.sql",
    import.meta.url
  ),
  "utf8"
);
const backfill = migration.slice(
  migration.indexOf("UPDATE feeds f SET organisation_id = NULL"),
  migration.indexOf("-- Update existing Premium accounts")
);

test("default feed backfill preserves feed/token identities and company custom feeds", async () => {
  await systemDatabase
    .$transaction(async (tx) => {
      const account = tenant.accountId;
      const company = await tx.organisation.create({
        data: {
          account_id: account,
          country_code: "AU",
          id: tenant.organisationId,
          name: "Payroll",
        },
      });
      const feed = await tx.feed.create({
        data: {
          account_id: account,
          name: "All staff",
          organisation_id: company.id,
          slug: "all-staff",
        },
      });
      const custom = await tx.feed.create({
        data: {
          account_id: account,
          name: "My team",
          organisation_id: company.id,
          slug: "my-team",
        },
      });
      const token = await tx.feedToken.create({
        data: {
          account_id: account,
          feed_id: feed.id,
          organisation_id: company.id,
          token_hash: randomUUID(),
          token_hint: "hint",
        },
      });
      const scope = await tx.feedScope.create({
        data: {
          account_id: account,
          feed_id: feed.id,
          organisation_id: company.id,
          scope_type: "org",
        },
      });
      const publication = await tx.feedEventPublication.create({
        data: {
          account_id: account,
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
          account_id: account,
          action: "feeds.created",
          organisation_id: company.id,
          payload: { defaultFeed: true },
          resource_id: feed.id,
          resource_type: "feed",
        },
      });
      // Historical SQL keeps its original column names. Transaction-local views
      // expose that shape while current Prisma fixtures retain account_id.
      for (const table of [
        "feeds",
        "feed_tokens",
        "feed_scopes",
        "feed_event_publications",
        "audit_events",
      ]) {
        await tx.$executeRawUnsafe(
          `CREATE TEMP VIEW "${table}" AS SELECT *, account_id AS clerk_org_id FROM public."${table}" WHERE account_id = '${account.replaceAll("'", "''")}'`
        );
      }
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
      const key = fixture.globalKey("plan_key");
      const plan = await tx.plan.create({
        data: {
          id: fixture.globalKey("plan_id"),
          key,
          name: "Owned Premium migration",
          plan_key: key,
        },
      });
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
      // The unchanged historical SQL recognises the canonical Premium key.
      // Project only this owned plan and its limits into that historical shape.
      const planId = plan.id.replaceAll("'", "''");
      await tx.$executeRawUnsafe(
        `CREATE TEMP VIEW plans AS SELECT id, 'premium'::text AS key, 'premium'::text AS plan_key FROM public.plans WHERE id = '${planId}'::uuid`
      );
      await tx.$executeRawUnsafe(
        `CREATE TEMP VIEW plan_limits AS SELECT * FROM public.plan_limits WHERE plan_id = '${planId}'::uuid`
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
