import { database } from "@repo/database";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { inngest } from "../client";

const RecountUsageSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
});

export type RecountUsageInput = z.input<typeof RecountUsageSchema>;

export const recountUsage = async (input: unknown) => {
  const parsed = RecountUsageSchema.parse(input);
  const [seats, payrollEntities, feeds] = await Promise.all([
    database.person.count({
      where: { archived_at: null, clerk_org_id: parsed.clerkOrgId },
    }),
    database.organisation.count({
      where: { archived_at: null, clerk_org_id: parsed.clerkOrgId },
    }),
    database.feed.count({
      where: {
        archived_at: null,
        clerk_org_id: parsed.clerkOrgId,
        status: "active",
      },
    }),
  ]);
  const now = new Date();
  const periodStart = new Date("1970-01-01T00:00:00.000Z");
  const periodEnd = new Date("9999-12-31T23:59:59.999Z");
  for (const [counterType, value] of Object.entries({
    feeds,
    payroll_entities: payrollEntities,
    seats,
  })) {
    await database.$executeRaw`
      INSERT INTO usage_counters (id, clerk_org_id, metric_key, counter_type, current_value, period_start, period_end, created_at, updated_at)
      VALUES (gen_random_uuid(), ${parsed.clerkOrgId}, ${counterType}, ${counterType}::plan_limit_type, ${value}, ${periodStart}, ${periodEnd}, NOW(), ${now})
      ON CONFLICT (clerk_org_id, counter_type) DO UPDATE SET
        current_value = EXCLUDED.current_value,
        metric_key = EXCLUDED.metric_key,
        period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        updated_at = EXCLUDED.updated_at
    `;
  }
  return { feeds, payrollEntities, seats };
};

export const recountUsageFunction: InngestFunction.Any = inngest.createFunction(
  {
    id: "recount-usage",
    triggers: { event: "recount-usage" },
  },
  async ({ event, step }) =>
    await step.run("recount-usage", async () => recountUsage(event.data))
);
