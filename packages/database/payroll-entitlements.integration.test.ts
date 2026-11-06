import { expect, test } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";
import { checkPayrollEntityEntitlement } from "./src/queries/payroll-entitlements";
import { syncPlansFromCatalogue } from "./src/seed/plan-sync";
import { getPlanDefinition } from "./src/seed/plans";
import { systemDatabase } from "./src/system-client";
import { withTenantDb } from "./src/tenant-db";

const fixture = allocateLiveTestFixture(
  "packages/database/payroll-entitlements.integration.test.ts"
);

test.each(["premium", "basic"] as const)(
  "%s persisted payroll limit gates the next company under the account lock",
  async (planKey) => {
    const planIndex = planKey === "premium" ? 0 : 1;
    const key = fixture.globalKey("plan_key", planIndex);
    const companies =
      planKey === "premium"
        ? fixture.tenants.slice(0, 5)
        : fixture.tenants.slice(5, 6);
    const account = companies[0]?.accountId;
    if (!account || companies.length !== (planKey === "premium" ? 5 : 1)) {
      throw new Error("Payroll entitlement fixture account is missing");
    }
    const definition = {
      ...getPlanDefinition(planKey),
      id: fixture.globalKey("plan_id", planIndex),
      plan_key: key,
    };
    await syncPlansFromCatalogue(systemDatabase, [definition]);
    try {
      await withTenantDb(
        account,
        async (tx) => {
          await tx.accountSubscription.create({
            data: { account_id: account, plan_key: key, status: "active" },
          });
          const count = planKey === "premium" ? 4 : 1;
          for (const [index, company] of companies.slice(0, count).entries()) {
            await tx.organisation.create({
              data: {
                account_id: account,
                country_code: "AU",
                id: company.organisationId,
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
            const fifthCompany = companies.at(4);
            if (!fifthCompany) {
              throw new Error("Fifth payroll fixture company is missing");
            }
            await tx.organisation.create({
              data: {
                account_id: account,
                country_code: "AU",
                id: fifthCompany.organisationId,
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
      await systemDatabase.accountSubscription.deleteMany({
        where: { account_id: account },
      });
      await systemDatabase.organisation.deleteMany({
        where: { account_id: account },
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
