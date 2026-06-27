import { beforeEach, describe, expect, it, vi } from "vitest";

interface SubscriptionRow {
  billing_interval: "month" | "year" | null;
  cancel_at_period_end: boolean;
  clerk_org_id: string;
  clerk_plan_key: string | null;
  current_period_end: Date | null;
  plan_key: string;
  seats_purchased: number;
  status: string;
}

// In-memory clerk_org_subscriptions keyed by the unique clerk_org_id, mirroring
// upsert and findUnique so idempotency and tenant scoping are observable.
const store = new Map<string, SubscriptionRow>();

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("../client", () => ({
  database: {
    clerkOrgSubscription: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
    },
  },
}));

const { upsertSubscriptionFromWebhook, getSubscriptionForOrg } = await import(
  "./billing"
);

interface UpsertArgs {
  create: SubscriptionRow;
  update: Omit<SubscriptionRow, "clerk_org_id">;
  where: { clerk_org_id: string };
}

describe("upsertSubscriptionFromWebhook", () => {
  beforeEach(() => {
    store.clear();
    mocks.upsert.mockReset();
    mocks.findUnique.mockReset();

    mocks.upsert.mockImplementation(({ where, create, update }: UpsertArgs) => {
      const existing = store.get(where.clerk_org_id);
      if (existing) {
        Object.assign(existing, update);
        return Promise.resolve(existing);
      }
      store.set(where.clerk_org_id, { ...create });
      return Promise.resolve(store.get(where.clerk_org_id));
    });

    mocks.findUnique.mockImplementation(
      ({ where }: { where: { clerk_org_id: string } }) =>
        Promise.resolve(store.get(where.clerk_org_id) ?? null)
    );
  });

  it("records a new subscription and mirrors plan_key to clerk_plan_key", async () => {
    const result = await upsertSubscriptionFromWebhook({
      clerkOrgId: "org_a",
      clerkPlanKey: "premium",
      status: "active",
    });

    expect(result.ok).toBe(true);
    const row = store.get("org_a");
    expect(row?.plan_key).toBe("premium");
    expect(row?.clerk_plan_key).toBe("premium");
    expect(row?.status).toBe("active");
  });

  it("is idempotent within one event: the same upsert leaves one row", async () => {
    const input = {
      clerkOrgId: "org_a",
      clerkPlanKey: "basic",
      status: "active",
    } as const;

    await upsertSubscriptionFromWebhook(input);
    await upsertSubscriptionFromWebhook(input);

    expect(store.size).toBe(1);
    expect(store.get("org_a")?.clerk_plan_key).toBe("basic");
  });

  it("scopes by clerk_org_id: org A and org B never share a row", async () => {
    await upsertSubscriptionFromWebhook({
      clerkOrgId: "org_a",
      clerkPlanKey: "basic",
      status: "active",
    });
    await upsertSubscriptionFromWebhook({
      clerkOrgId: "org_b",
      clerkPlanKey: "premium",
      status: "active",
    });

    expect(store.size).toBe(2);
    const a = await getSubscriptionForOrg("org_a");
    const b = await getSubscriptionForOrg("org_b");
    expect(a?.clerk_plan_key).toBe("basic");
    expect(b?.clerk_plan_key).toBe("premium");
  });

  it("records a downgrade by setting cancel_at_period_end", async () => {
    await upsertSubscriptionFromWebhook({
      clerkOrgId: "org_a",
      clerkPlanKey: "premium",
      status: "active",
    });
    await upsertSubscriptionFromWebhook({
      cancelAtPeriodEnd: true,
      clerkOrgId: "org_a",
      clerkPlanKey: "basic",
      status: "active",
    });

    const row = store.get("org_a");
    expect(row?.cancel_at_period_end).toBe(true);
    expect(row?.clerk_plan_key).toBe("basic");
    expect(store.size).toBe(1);
  });

  it("rejects a malformed payload", async () => {
    const result = await upsertSubscriptionFromWebhook({
      clerkOrgId: "",
      clerkPlanKey: "basic",
      status: "active",
    });
    expect(result.ok).toBe(false);
  });
});
