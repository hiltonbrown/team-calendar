import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authority,
  campaign,
  controlFixture,
  functionId,
  reference,
  scope,
  storeFixture,
  uuid,
} from "./xero-campaign.test-support";
import {
  assertXeroCampaignAccess,
  assertXeroCampaignAuthority,
  assertXeroCampaignProviderAccess,
  claimXeroCampaignScheduledDispatch,
  recordXeroCampaignDispatch,
  transitionXeroCampaign,
  withXeroCampaignInvocation,
  withXeroCampaignObservation,
  withXeroCampaignProviderEffect,
} from "./xero-campaign-access";
import { XeroCampaignStore } from "./xero-campaign-store";

vi.mock("server-only", () => ({}));
const databaseMocks = vi.hoisted(() => ({
  lock: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@repo/database", () => ({
  database: { $transaction: databaseMocks.transaction },
  lockXeroCampaign: databaseMocks.lock,
}));
beforeEach(() => {
  databaseMocks.lock.mockReset();
  databaseMocks.transaction.mockImplementation(async (operation) =>
    operation({})
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("campaign storage and authority", () => {
  it("denies absent sentinel, missing root and wrong active owner", async () => {
    const fixture = storeFixture();
    const store = new XeroCampaignStore(fixture.configuration);
    fixture.values.delete(fixture.keys.sentinel);
    await expect(store.readOrganisation(scope.organisationId)).rejects.toThrow(
      "xero_campaign_admission_denied"
    );
    fixture.values.set(
      fixture.keys.sentinel,
      JSON.stringify({
        credentialDomainId: uuid(1),
        databaseTargetHash: reference,
        version: 1,
      })
    );
    fixture.values.set("release:active-run", uuid(90));
    await expect(store.readOrganisation(scope.organisationId)).rejects.toThrow(
      "xero_campaign_admission_denied"
    );
    fixture.values.set("release:active-run", uuid(8));
    fixture.values.delete(fixture.keys.control(campaign.runId));
    await expect(store.readOrganisation(scope.organisationId)).rejects.toThrow(
      "xero_campaign_admission_denied"
    );
  });
  it("permits ordinary work only with a verified idle namespace", async () => {
    const fixture = storeFixture(null);
    const operation = vi.fn(async () => "ordinary");
    await expect(
      withXeroCampaignInvocation(
        functionId,
        scope,
        operation,
        null,
        fixture.configuration
      )
    ).resolves.toBe("ordinary");
    fixture.values.delete(fixture.keys.sentinel);
    await expect(
      withXeroCampaignInvocation(
        functionId,
        scope,
        operation,
        null,
        fixture.configuration
      )
    ).rejects.toThrow();
    expect(operation).toHaveBeenCalledOnce();
  });
  it.each([
    { bindingGeneration: 3 },
    { clerkOrgId: "org_foreign" },
    { xeroTenantId: uuid(99) },
    { runId: uuid(99) },
    { epoch: 5 },
    { candidateSha: "c".repeat(40) },
    { externalTenantId: uuid(99) },
    { functionId: "foreign-worker" },
  ])("denies mismatched authority %j", async (override) => {
    const fixture = storeFixture();
    await expect(
      assertXeroCampaignAuthority(
        { ...authority, ...override },
        fixture.configuration
      )
    ).rejects.toThrow();
  });
  it.each(["acquiring", "draining", "recovering", "closed"] as const)(
    "denies campaign activity in %s",
    async (phase) => {
      const fixture = storeFixture(controlFixture({ phase }));
      await expect(
        assertXeroCampaignAuthority(authority, fixture.configuration)
      ).rejects.toThrow();
    }
  );
  it("expired controls remain reserved and stale registration cannot authorise work", async () => {
    const fixture = storeFixture(
      controlFixture({ expiresAt: new Date(Date.now() - 1).toISOString() })
    );
    await expect(
      withXeroCampaignInvocation(
        functionId,
        scope,
        async () => undefined,
        null,
        fixture.configuration
      )
    ).rejects.toThrow();
    fixture.writeControl(
      controlFixture({
        registrationObservedAt: new Date(
          Date.now() - 16 * 60_000
        ).toISOString(),
      })
    );
    await expect(
      assertXeroCampaignAuthority(authority, fixture.configuration)
    ).rejects.toThrow();
  });
  it("optimistic concurrent claims have one winner", async () => {
    const fixture = storeFixture();
    const store = new XeroCampaignStore(fixture.configuration);
    const [first, second] = await Promise.all([
      store.readOrganisation(scope.organisationId),
      store.readOrganisation(scope.organisationId),
    ]);
    const control = fixture.readControl();
    const results = await Promise.allSettled([
      store.compareAndSet(first, { ...control, phase: "draining" }),
      store.compareAndSet(second, { ...control, phase: "recovering" }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
  });
});

describe("campaign dispatch and effects", () => {
  it("rejects malformed and replayed worker input before the operation", async () => {
    const fixture = storeFixture();
    const operation = vi.fn(async () => undefined);
    await expect(
      withXeroCampaignInvocation(
        functionId,
        { ...scope, bindingGeneration: undefined },
        operation,
        null,
        fixture.configuration
      )
    ).rejects.toThrow();
    await withXeroCampaignInvocation(
      functionId,
      { ...scope, campaign },
      operation,
      "worker-1",
      fixture.configuration
    );
    await expect(
      withXeroCampaignInvocation(
        functionId,
        { ...scope, campaign },
        operation,
        "worker-2",
        fixture.configuration
      )
    ).rejects.toThrow();
    expect(operation).toHaveBeenCalledOnce();
    expect(fixture.readControl().tickets[0]?.workerRunId).toBe("worker-1");
  });
  it("records accepted event ids even when the worker has already started", async () => {
    const fixture = storeFixture();
    await withXeroCampaignInvocation(
      functionId,
      { ...scope, campaign },
      async () => {
        await recordXeroCampaignDispatch(scope, functionId, campaign, [
          "event-1",
        ]);
      },
      "worker-1",
      fixture.configuration
    );
    expect(fixture.readControl().tickets[0]).toMatchObject({
      eventIds: ["event-1"],
      outcome: "succeeded",
    });
  });
  it("exact scheduled ticket permits only one attributed cron claim", async () => {
    const fixture = storeFixture();
    await expect(
      claimXeroCampaignScheduledDispatch(
        scope,
        functionId,
        "wrong-slot",
        "scheduler"
      )
    ).rejects.toThrow();
    await expect(
      claimXeroCampaignScheduledDispatch(
        scope,
        functionId,
        "2026-09-29T10:00Z",
        undefined
      )
    ).rejects.toThrow();
    expect(
      await claimXeroCampaignScheduledDispatch(
        scope,
        functionId,
        "2026-09-29T10:00Z",
        "scheduler"
      )
    ).toEqual(campaign);
    await expect(
      claimXeroCampaignScheduledDispatch(
        scope,
        functionId,
        "2026-09-29T10:00Z",
        "replay"
      )
    ).rejects.toThrow();
    expect(fixture.readControl().tickets[0]?.schedulerRunId).toBe("scheduler");
  });
  it("denies foreign external targets even when that target has no reservation", async () => {
    const fixture = storeFixture();
    await withXeroCampaignInvocation(
      functionId,
      { ...scope, campaign },
      async () => {
        await expect(
          assertXeroCampaignProviderAccess({
            kind: "tenant",
            providerAppId: "fixture-app",
            tenantHeader: uuid(4),
            url: "https://api.xero.com/payroll.xro/1.0/Employees",
            xeroTenantId: uuid(90),
          })
        ).rejects.toThrow();
      },
      "worker-1",
      fixture.configuration
    );
  });
  it("keeps an uncertain transport attempt durable after failure", async () => {
    const fixture = storeFixture();
    const operation = vi.fn(() => Promise.reject(new Error("response lost")));
    await expect(
      withXeroCampaignInvocation(
        functionId,
        { ...scope, campaign },
        () =>
          withXeroCampaignProviderEffect(
            {
              kind: "tenant",
              providerAppId: "fixture-app",
              tenantHeader: uuid(4),
              url: "https://api.xero.com/payroll.xro/1.0/Employees",
              xeroTenantId: uuid(4),
            },
            operation
          ),
        "worker-1",
        fixture.configuration
      )
    ).rejects.toThrow("response lost");
    expect(operation).toHaveBeenCalledOnce();
    expect(fixture.readControl().effects[0]?.outcome).toBe("uncertain");
    expect(fixture.readControl().tickets[0]?.outcome).toBe("failed");
  });
  it("drain blocks further effects while a started attempt closes its durable entry", async () => {
    const fixture = storeFixture();
    await withXeroCampaignInvocation(
      functionId,
      { ...scope, campaign },
      async () => {
        await withXeroCampaignProviderEffect(
          {
            kind: "tenant",
            providerAppId: "fixture-app",
            tenantHeader: uuid(4),
            url: "https://api.xero.com/payroll.xro/1.0/Employees",
            xeroTenantId: uuid(4),
          },
          async () => {
            expect(fixture.readControl().effects[0]?.outcome).toBe(
              "dispatched"
            );
            await transitionXeroCampaign(
              campaign.runId,
              campaign.epoch,
              "draining",
              fixture.configuration
            );
          }
        );
        await expect(assertXeroCampaignAccess(scope)).rejects.toThrow();
      },
      "worker-1",
      fixture.configuration
    );
    expect(fixture.readControl().phase).toBe("draining");
    expect(fixture.readControl().effects[0]?.outcome).toBe("completed");
  });
  it("refuses release without closure or with unfinished effects", async () => {
    const fixture = storeFixture(
      controlFixture({ phase: "draining", tickets: [] })
    );
    await expect(
      transitionXeroCampaign(
        campaign.runId,
        campaign.epoch,
        "closed",
        fixture.configuration
      )
    ).rejects.toThrow();
    fixture.writeControl({
      ...fixture.readControl(),
      closure: {
        cleanupReference: reference,
        restorationReference: reference,
        workerDrainReference: reference,
        writerClosureReference: reference,
      },
      effects: [
        { dispatchId: campaign.dispatchId, id: uuid(77), outcome: "uncertain" },
      ],
    });
    await expect(
      transitionXeroCampaign(
        campaign.runId,
        campaign.epoch,
        "closed",
        fixture.configuration
      )
    ).rejects.toThrow();
  });
});

describe("observer authority", () => {
  it("allows only the exact provider GET and refuses scope replacement", async () => {
    const fixture = storeFixture();
    const target = {
      kind: "tenant",
      method: "GET",
      providerAppId: "fixture-app",
      tenantHeader: uuid(4),
      url: "https://api.xero.com/payroll.xro/1.0/Employees",
      xeroTenantId: uuid(4),
    };
    await withXeroCampaignObservation(
      authority,
      async () => {
        await assertXeroCampaignProviderAccess(target);
        await expect(
          assertXeroCampaignProviderAccess({ ...target, method: "POST" })
        ).rejects.toThrow();
        await expect(
          assertXeroCampaignProviderAccess({
            ...target,
            tenantHeader: uuid(90),
          })
        ).rejects.toThrow();
        await expect(
          assertXeroCampaignProviderAccess({
            ...target,
            url: "https://api.xero.com/connections",
          })
        ).rejects.toThrow();
        await expect(
          assertXeroCampaignAccess({ ...scope, organisationId: uuid(90) })
        ).rejects.toThrow();
        await expect(
          assertXeroCampaignAccess({ ...scope, bindingGeneration: 3 })
        ).rejects.toThrow();
      },
      fixture.configuration
    );
  });
});

it("cannot rewrite resources or erase uncertain effects through the store API", async () => {
  const fixture = storeFixture(
    controlFixture({
      effects: [
        { dispatchId: campaign.dispatchId, id: uuid(40), outcome: "uncertain" },
      ],
    })
  );
  const store = new XeroCampaignStore(fixture.configuration);
  const snapshot = await store.readOrganisation(scope.organisationId);
  const control = fixture.readControl();
  await expect(
    store.compareAndSet(snapshot, { ...control, effects: [] })
  ).rejects.toThrow();
  await expect(
    store.compareAndSet(snapshot, {
      ...control,
      resources: control.resources.map((resource) => ({
        ...resource,
        bindingGeneration: 3,
      })),
    })
  ).rejects.toThrow();
  expect(fixture.readControl()).toEqual(control);
});

it("raw store transitions cannot close active or uncertain work", async () => {
  const fixture = storeFixture();
  const store = new XeroCampaignStore(fixture.configuration);
  const snapshot = await store.readOrganisation(scope.organisationId);
  await expect(
    store.compareAndSet(snapshot, { ...fixture.readControl(), phase: "closed" })
  ).rejects.toThrow();
  fixture.writeControl(
    controlFixture({
      closure: {
        cleanupReference: reference,
        restorationReference: reference,
        workerDrainReference: reference,
        writerClosureReference: reference,
      },
      effects: [
        { dispatchId: campaign.dispatchId, id: uuid(40), outcome: "uncertain" },
      ],
      phase: "draining",
      tickets: [],
    })
  );
  const draining = await store.readOrganisation(scope.organisationId);
  await expect(
    store.compareAndSet(draining, { ...fixture.readControl(), phase: "closed" })
  ).rejects.toThrow();
});
