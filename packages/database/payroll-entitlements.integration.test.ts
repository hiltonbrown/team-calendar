import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { isLocalDatabase } from "./src/is-local-database";
import { checkPayrollEntityEntitlement } from "./src/queries/payroll-entitlements";
import { syncPlansFromCatalogue } from "./src/seed/plan-sync";
import { getPlanDefinition } from "./src/seed/plans";
import { systemDatabase } from "./src/system-client";
import { tenantTransaction } from "./src/tenant-client";

const ownerUrl = process.env.DATABASE_URL;
if (!(ownerUrl && isLocalDatabase(ownerUrl))) {
  throw new Error(
    "Multi-company database fixtures require disposable local PostgreSQL"
  );
}

test.each(["premium", "basic"] as const)(
  "%s persisted payroll limit gates the next company under the account lock",
  async (planKey) => {
    const key = `payroll-plan-${randomUUID()}`;
    const account = `payroll-account-${randomUUID()}`;
    const definition = { ...getPlanDefinition(planKey), plan_key: key };
    await syncPlansFromCatalogue(systemDatabase, [definition]);
    try {
      await tenantTransaction(
        account,
        async (tx) => {
          await tx.clerkOrgSubscription.create({
            data: { clerk_org_id: account, plan_key: key, status: "active" },
          });
          const count = planKey === "premium" ? 4 : 1;
          for (let index = 0; index < count; index += 1) {
            await tx.organisation.create({
              data: {
                clerk_org_id: account,
                country_code: "AU",
                name: `Payroll ${index}`,
              },
            });
          }
          expect(await checkPayrollEntityEntitlement(account, tx)).toEqual({
            ok: true,
            value: {
              allowed: planKey === "premium",
              current: count,
              limit: definition.limits.payroll_entities,
            },
          });
          if (planKey === "premium") {
            await tx.organisation.create({
              data: {
                clerk_org_id: account,
                country_code: "AU",
                name: "Fifth payroll",
              },
            });
            expect(await checkPayrollEntityEntitlement(account, tx)).toEqual({
              ok: true,
              value: { allowed: false, current: 5, limit: 5 },
            });
          }
        },
        { maxWait: 15_000, timeout: 15_000 }
      );
    } finally {
      await systemDatabase.clerkOrgSubscription.deleteMany({
        where: { clerk_org_id: account },
      });
      await systemDatabase.organisation.deleteMany({
        where: { clerk_org_id: account },
      });
      const plan = await systemDatabase.plan.findUnique({ where: { key } });
      if (plan) {
        await systemDatabase.planLimit.deleteMany({
          where: { plan_id: plan.id },
        });
        await systemDatabase.plan.delete({ where: { id: plan.id } });
      }
    }
  }
);
