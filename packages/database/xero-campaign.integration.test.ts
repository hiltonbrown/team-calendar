// biome-ignore-all lint/style/useFilenamingConvention: Protected integration inventory uses this suffix.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { database } from "./src/client";
import { initialiseLiveCampaignFixture } from "./src/live-campaign-fixture";
import { deleteSharedStoreFixtureKeys } from "./src/live-shared-store-fixture";
import { allocateLiveTestFixture } from "./src/live-test-fixture";
import {
  initialiseXeroCampaign,
  reserveXeroCampaignTicket,
  transitionXeroCampaign,
  withXeroCampaignInvocation,
  withXeroCampaignProviderEffect,
} from "./src/xero-campaign-access";
import {
  type XeroCampaignControl,
  XeroCampaignControlSchema,
} from "./src/xero-campaign-contract";
import {
  XeroCampaignStore,
  xeroCampaignStoreCredentials,
} from "./src/xero-campaign-store";

vi.mock("server-only", () => ({}));
const fixture = allocateLiveTestFixture(
  "packages/database/xero-campaign.integration.test.ts"
);
const [tenant, sibling] = fixture.tenants;
if (!(tenant && sibling)) {
  throw new Error("Campaign test requires both owned tenants");
}
const scope = { ...tenant, bindingGeneration: 0, xeroTenantId: null };
const runId = fixture.id("campaign-run");
const functionId = "controlled-database-fence-test";
let candidateSha = "";
let ticketIndex = 0;
let control: XeroCampaignControl;
const providerAppId = fixture.globalKey("provider_app");
const externalTenantId = fixture.id("external-tenant");
function barrier() {
  let release: () => void = () => {
    throw new Error("Barrier not initialised");
  };
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { ready, release };
}
function reserve() {
  ticketIndex += 1;
  return reserveXeroCampaignTicket(
    { ...scope, candidateSha, epoch: 1, runId },
    {
      bindingGeneration: scope.bindingGeneration,
      clerkOrgId: scope.clerkOrgId,
      dispatchId: fixture.id("dispatch", ticketIndex),
      functionId,
      organisationId: scope.organisationId,
      scheduledSlot: null,
      schedulerRunId: null,
      targetHash: null,
      userId: null,
    }
  );
}
const where = { clerk_org_id: tenant.clerkOrgId, id: tenant.organisationId };

beforeAll(async () => {
  await initialiseLiveCampaignFixture(fixture);
  const store = new XeroCampaignStore();
  const snapshot = await store.readOrganisation(tenant.organisationId);
  candidateSha = store.input.runtimeRevision;
  const path = process.env.TC_RELEASE_MANIFEST;
  if (!path) {
    throw new Error("Protected manifest absent");
  }
  await database.organisation.createMany({
    data: fixture.tenants.map((owned) => ({
      clerk_org_id: owned.clerkOrgId,
      country_code: "AU",
      id: owned.organisationId,
      name: "Campaign fixture unchanged",
    })),
  });
  control = XeroCampaignControlSchema.parse({
    allowedFunctions: [functionId],
    candidateSha,
    closure: null,
    credentialDomainId: store.input.credentialDomainId,
    databaseRunId: fixture.runId,
    databaseTargetHash: snapshot.sentinel.databaseTargetHash,
    effects: [],
    epoch: 1,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    manifestHash: createHash("sha256").update(readFileSync(path)).digest("hex"),
    phase: "acquiring",
    registrationObservedAt: new Date().toISOString(),
    // This identifies the controlled test receipt, not a registered provider worker.
    registrationReference: `sha256:${createHash("sha256").update(`${fixture.runId}:${functionId}`).digest("hex")}`,
    resources: [
      {
        ...scope,
        credentialOwnerId: null,
        externalTenantId,
        providerAppId,
      },
    ],
    runId,
    sanctionedActors: [],
    tickets: [],
    version: 1,
  });
});

afterAll(async () => {
  await database.organisation.deleteMany({
    where: {
      OR: fixture.tenants.map((owned) => ({
        clerk_org_id: owned.clerkOrgId,
        id: owned.organisationId,
      })),
    },
  });
  await deleteSharedStoreFixtureKeys({
    globalKeys: [`campaign_domain:${fixture.globalKey("campaign_domain")}`],
    ...xeroCampaignStoreCredentials(),
  });
  await database.$disconnect();
});

it("holds real campaign acquisition until a prior ordinary provider response completes", async () => {
  const entered = barrier();
  const release = barrier();
  const ordinary = withXeroCampaignProviderEffect(
    {
      kind: "tenant",
      providerAppId,
      tenantHeader: externalTenantId,
      url: "https://api.xero.com/payroll.xro/1.0/Employees",
      xeroTenantId: externalTenantId,
    },
    async () => {
      entered.release();
      await release.ready;
      return "buffered";
    }
  );
  try {
    await Promise.race([entered.ready, ordinary]);
    await expect(initialiseXeroCampaign(control)).rejects.toThrow(
      "xero_campaign_admission_denied"
    );
  } finally {
    release.release();
  }
  await expect(ordinary).resolves.toBe("buffered");
  await initialiseXeroCampaign(control);
  await transitionXeroCampaign(runId, 1, "active");
});

describe("real shared-store and PostgreSQL campaign fencing", () => {
  it("allows only the current ticket to commit inside its owned scope", async () => {
    const campaign = await reserve();
    await withXeroCampaignInvocation(
      functionId,
      { ...scope, campaign },
      async () => {
        await database.organisation.update({
          data: { name: "Campaign fixture committed" },
          where,
        });
      },
      fixture.key("worker-run", 1)
    );
    expect((await database.organisation.findFirstOrThrow({ where })).name).toBe(
      "Campaign fixture committed"
    );
    expect(
      (
        await database.organisation.findFirstOrThrow({
          where: {
            clerk_org_id: sibling.clerkOrgId,
            id: sibling.organisationId,
          },
        })
      ).name
    ).toBe("Campaign fixture unchanged");
  });

  it("denies an ordinary event for a reserved scope before invoking its writer", async () => {
    const writer = vi.fn(() =>
      database.organisation.update({ data: { name: "Forbidden" }, where })
    );
    await expect(
      withXeroCampaignInvocation(functionId, scope, writer)
    ).rejects.toThrow("admission_denied");
    expect(writer).not.toHaveBeenCalled();
  });

  it("revokes a worker between its observation and local persistence", async () => {
    const campaign = await reserve();
    const observed = barrier();
    const persist = barrier();
    const worker = withXeroCampaignInvocation(
      functionId,
      { ...scope, campaign },
      async () => {
        await database.organisation.findFirstOrThrow({ where });
        observed.release();
        await persist.ready;
        await database.organisation.update({
          data: { name: "Forbidden late write" },
          where,
        });
      },
      fixture.key("worker-run", 2)
    );
    const rejected = expect(worker).rejects.toThrow("admission_denied");
    try {
      await Promise.race([observed.ready, worker]);
      await transitionXeroCampaign(runId, 1, "draining");
    } finally {
      persist.release();
    }
    await rejected;
    expect((await database.organisation.findFirstOrThrow({ where })).name).toBe(
      "Campaign fixture committed"
    );
  });
});

it("allows an unrelated tenant in the same app and retains an uncertain response", async () => {
  const unrelatedTenant = fixture.id("unrelated-external-tenant");
  const store = new XeroCampaignStore();
  const operation = vi.fn(() => Promise.reject(new Error("response lost")));
  await expect(
    withXeroCampaignProviderEffect(
      {
        kind: "tenant",
        providerAppId,
        tenantHeader: unrelatedTenant,
        url: "https://api.xero.com/payroll.xro/1.0/Employees",
        xeroTenantId: unrelatedTenant,
      },
      operation
    )
  ).rejects.toThrow("response lost");
  expect(operation).toHaveBeenCalledOnce();
  expect(
    await store.command([
      "HLEN",
      store.keys.ordinaryProviderAttempts(providerAppId, unrelatedTenant),
    ])
  ).toBe(1);
});
