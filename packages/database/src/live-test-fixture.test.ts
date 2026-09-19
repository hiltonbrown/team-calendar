import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  allocateLiveTestFixture,
  LIVE_FIXTURE_SUITES,
  REQUIRED_LIVE_FIXTURE_TENANT_SLOTS,
} from "./live-test-fixture";

const runId = "11111111-1111-4111-8111-111111111111";
const fixtureUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/;
const manifestPath = join(
  process.env.TMPDIR ?? "/tmp",
  `team-calendar-live-fixture-${process.pid}.json`
);

const organisationIds = Array.from(
  { length: REQUIRED_LIVE_FIXTURE_TENANT_SLOTS },
  (_, index) => `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`
);
const clerkOrgIds = organisationIds.map((_, index) => `org_release_${index}`);

const environment = { ...process.env };

const configureEnvironment = () => {
  Object.assign(process.env, {
    ALLOW_LIVE_DATABASE_TESTS: "I_ACKNOWLEDGE_LIVE_MUTATION",
    DATABASE_URL: "postgresql://role@host/database",
    NODE_ENV: "test",
    TC_RELEASE_ACTIVE_RUN_VERIFIED: runId,
    TC_RELEASE_DURABLE_VERIFIED: runId,
    TC_RELEASE_MANIFEST: manifestPath,
    TC_RELEASE_RUN_ID: runId,
  });
};

afterEach(() => {
  process.env = { ...environment };
});

describe("live fixture registry", () => {
  it("allocates disjoint exact manifest slots for every reviewed suite", () => {
    writeFileSync(
      manifestPath,
      JSON.stringify({
        active: true,
        durableManifestConfirmed: true,
        namespace: `release:run:${runId}`,
        owned: {
          clerkOrgIds,
          globalKeys: [
            ...Array.from(
              { length: 7 },
              (_, index) =>
                `plan_id:22222222-2222-4222-8222-${index.toString().padStart(12, "0")}`
            ),
            ...Array.from(
              { length: 7 },
              (_, index) => `plan_key:release_plan_${index}`
            ),
            ...Array.from(
              { length: 5 },
              (_, index) => `stripe_event:evt_release_${index}`
            ),
          ],
          organisationIds,
        },
        runId,
        target: {
          database: "database",
          endpointId: "endpoint",
          hostname: "host",
          role: "role",
        },
        version: 1,
      })
    );
    configureEnvironment();

    const allocations = Object.keys(LIVE_FIXTURE_SUITES).map((suite) =>
      allocateLiveTestFixture(suite as keyof typeof LIVE_FIXTURE_SUITES)
    );
    const allocatedClerkIds = allocations.flatMap((item) =>
      item.tenants.map((tenant) => tenant.clerkOrgId)
    );
    const allocatedOrganisationIds = allocations.flatMap((item) =>
      item.tenants.map((tenant) => tenant.organisationId)
    );

    expect(Object.keys(LIVE_FIXTURE_SUITES)).toHaveLength(21);
    expect(allocatedClerkIds).toHaveLength(REQUIRED_LIVE_FIXTURE_TENANT_SLOTS);
    expect(new Set(allocatedClerkIds).size).toBe(allocatedClerkIds.length);
    expect(new Set(allocatedOrganisationIds).size).toBe(
      allocatedOrganisationIds.length
    );
    const allocatedGlobalKeys = allocations.flatMap((allocation) => {
      const specification = LIVE_FIXTURE_SUITES[allocation.suite] as {
        globalKeys?: Partial<
          Record<"plan_id" | "plan_key" | "stripe_event", number>
        >;
      };
      return (["plan_id", "plan_key", "stripe_event"] as const).flatMap(
        (kind) =>
          Array.from(
            { length: specification.globalKeys?.[kind] ?? 0 },
            (_, index) => `${kind}:${allocation.globalKey(kind, index)}`
          )
      );
    });
    expect(new Set(allocatedGlobalKeys).size).toBe(allocatedGlobalKeys.length);
    expect(allocations[0]?.id("person")).toMatch(fixtureUuidPattern);
    expect(allocations[0]?.key("record")).toContain(runId.replaceAll("-", ""));
    expect(
      allocations
        .find((item) => item.suite.includes("plan_limits.integration"))
        ?.globalKey("plan_key")
    ).toBe("release_plan_3");
    const planLimitAllocation = allocations.find((item) =>
      item.suite.includes("plan_limits.integration")
    );
    expect(() => planLimitAllocation?.globalKey("plan_key", -1)).toThrow(
      "does not own"
    );
    expect(() => planLimitAllocation?.globalKey("plan_key", 0.5)).toThrow(
      "does not own"
    );
  });

  it("rejects a manifest without the complete disjoint allocation", () => {
    writeFileSync(
      manifestPath,
      JSON.stringify({
        active: true,
        durableManifestConfirmed: true,
        namespace: `release:run:${runId}`,
        owned: {
          clerkOrgIds: ["org_only"],
          globalKeys: [],
          organisationIds: ["00000000-0000-4000-8000-000000000000"],
        },
        runId,
        target: {
          database: "database",
          endpointId: "endpoint",
          hostname: "host",
          role: "role",
        },
        version: 1,
      })
    );
    configureEnvironment();

    expect(() =>
      allocateLiveTestFixture(
        "packages/database/availability_records.integration.test.ts"
      )
    ).toThrow("disjoint tenant slots");
  });

  it("rejects duplicate durable global ownership keys", () => {
    writeFileSync(
      manifestPath,
      JSON.stringify({
        active: true,
        durableManifestConfirmed: true,
        namespace: `release:run:${runId}`,
        owned: {
          clerkOrgIds,
          globalKeys: Array.from({ length: 17 }, () => "plan_id:duplicate"),
          organisationIds,
        },
        runId,
        target: {
          database: "database",
          endpointId: "endpoint",
          hostname: "host",
          role: "role",
        },
        version: 1,
      })
    );
    configureEnvironment();

    expect(() =>
      allocateLiveTestFixture(
        "packages/database/availability_records.integration.test.ts"
      )
    ).toThrow("ownership slots must be unique");
  });

  it("rejects an unregistered suite", () => {
    configureEnvironment();
    expect(() =>
      allocateLiveTestFixture(
        "packages/database/unknown.integration.test.ts" as keyof typeof LIVE_FIXTURE_SUITES
      )
    ).toThrow("not in the protected registry");
  });
});
