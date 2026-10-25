import { assertTenantDb, type TenantDb, withTenantDb } from "@repo/database";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { inngest } from "../client";
import { readJobEventData } from "../event-context";

const RecountUsageSchema = z.object({
  accountId: z.string().min(1),
  organisationId: z.string().uuid(),
});

export type RecountUsageInput = z.input<typeof RecountUsageSchema>;

export const recountUsage = async (input: unknown, db: TenantDb) => {
  const parsed = RecountUsageSchema.parse(input);
  assertTenantDb(db, parsed.accountId);
  {
    assertTenantDb(db, parsed.accountId);
    const client = db;

    const [seats, payrollEntities, feeds] = [
      await client.person.count({
        where: {
          account_id: parsed.accountId,
          archived_at: null,
          is_active: true,
        },
      }),
      await client.organisation.count({
        where: {
          account_id: parsed.accountId,
          archived_at: null,
          is_active: true,
        },
      }),
      await client.feed.count({
        where: {
          account_id: parsed.accountId,
          archived_at: null,
          status: "active",
        },
      }),
    ];
    const now = new Date();
    const periodStart = new Date("1970-01-01T00:00:00.000Z");
    const periodEnd = new Date("9999-12-31T23:59:59.999Z");
    for (const [counterType, value] of Object.entries({
      feeds,
      payroll_entities: payrollEntities,
      seats,
    })) {
      await client.$executeRaw`
      INSERT INTO usage_counters (id, account_id, metric_key, counter_type, current_value, period_start, period_end, created_at, updated_at)
      VALUES (gen_random_uuid(), ${parsed.accountId}, ${counterType}, ${counterType}::plan_limit_type, ${value}, ${periodStart}, ${periodEnd}, NOW(), ${now})
      ON CONFLICT (account_id, counter_type) DO UPDATE SET
        current_value = EXCLUDED.current_value,
        metric_key = EXCLUDED.metric_key,
        period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        updated_at = EXCLUDED.updated_at
    `;
    }
    return { feeds, payrollEntities, seats };
  }
};

export const recountUsageFunction: InngestFunction.Any = inngest.createFunction(
  {
    id: "recount-usage",
    triggers: { event: "recount-usage" },
  },
  async ({ event, step }) =>
    await step.run("recount-usage", () => {
      const context = readJobEventData(event.data);
      return withTenantDb(context.accountId, (db) => recountUsage(context, db));
    })
);
