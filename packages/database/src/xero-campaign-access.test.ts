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
  dispatchXeroCampaignChild,
  initialiseXeroCampaign,
  reconcileXeroCampaignActionBinding,
  recordXeroCampaignDispatch,
  transitionXeroCampaign,
  withXeroCampaignAction,
  withXeroCampaignChildInvocation,
  withXeroCampaignInvocation,
  withXeroCampaignObservation,
  withXeroCampaignProviderEffect,
  withXeroCampaignWrite,
} from "./xero-campaign-access";
import { xeroCampaignActionTargetHash } from "./xero-campaign-contract";
import { XeroCampaignStore } from "./xero-campaign-store";

vi.mock("server-only", () => ({}));
const databaseMocks = vi.hoisted(() => ({
  bindings: vi.fn(),
  lock: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@repo/database", () => ({
  database: {
    $transaction: databaseMocks.transaction,
    xeroTenant: { findMany: databaseMocks.bindings },
  },
  lockXeroCampaign: databaseMocks.lock,
}));
beforeEach(() => {
  databaseMocks.lock.mockReset();
  databaseMocks.bindings.mockResolvedValue([
    {
      binding_generation: scope.bindingGeneration,
      id: scope.xeroTenantId,
      xero_tenant_id: uuid(4),
    },
  ]);
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
  it.each(["removed", "replaced"])(
    "rejects %s sentinel between read and atomic update",
    async (mode) => {
      const fixture = storeFixture();
      const store = new XeroCampaignStore(fixture.configuration);
      const snapshot = await store.readOrganisation(scope.organisationId);
      if (mode === "removed") {
        fixture.values.delete(fixture.keys.sentinel);
      } else {
        fixture.values.set(
          fixture.keys.sentinel,
          JSON.stringify({
            ...snapshot.sentinel,
            databaseTargetHash: `sha256:${"c".repeat(64)}`,
          })
        );
      }
      await expect(
        store.compareAndSet(snapshot, {
          ...fixture.readControl(),
          phase: "draining",
        })
      ).rejects.toThrow();
      expect(fixture.readControl().phase).toBe("active");
    }
  );
  it("accepts unchanged valid sentinel bytes with noncanonical JSON formatting", async () => {
    const fixture = storeFixture();
    fixture.values.set(
      fixture.keys.sentinel,
      JSON.stringify(
        {
          credentialDomainId: uuid(1),
          databaseTargetHash: reference,
          version: 1,
        },
        null,
        2
      )
    );
    const store = new XeroCampaignStore(fixture.configuration);
    const snapshot = await store.readOrganisation(scope.organisationId);
    await store.compareAndSet(snapshot, {
      ...fixture.readControl(),
      phase: "draining",
    });
    expect(fixture.readControl().phase).toBe("draining");
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
  it("retains the original worker identity across retry and rejects another run", async () => {
    const fixture = storeFixture();
    await expect(
      withXeroCampaignInvocation(
        functionId,
        { ...scope, campaign },
        () => Promise.reject(new Error("retryable")),
        "worker-1",
        fixture.configuration
      )
    ).rejects.toThrow("retryable");
    const foreign = vi.fn(async () => undefined);
    await expect(
      withXeroCampaignInvocation(
        functionId,
        { ...scope, campaign },
        foreign,
        "worker-2",
        fixture.configuration
      )
    ).rejects.toThrow();
    expect(foreign).not.toHaveBeenCalled();
    expect(fixture.readControl().tickets[0]?.workerRunId).toBe("worker-1");
    await withXeroCampaignInvocation(
      functionId,
      { ...scope, campaign },
      async () => undefined,
      "worker-1",
      fixture.configuration
    );
    expect(fixture.readControl().tickets[0]?.outcome).toBe("succeeded");
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
  it("drain preserves the admitted invocation while a started attempt closes its durable entry", async () => {
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
        await expect(assertXeroCampaignAccess(scope)).resolves.toMatchObject({
          ticket: { outcome: "running" },
        });
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

describe("ordinary provider attempts before acquisition", () => {
  const target = {
    kind: "tenant",
    providerAppId: "fixture-app",
    tenantHeader: uuid(4),
    url: "https://api.xero.com/payroll.xro/1.0/Employees",
    xeroTenantId: uuid(4),
  };
  function acquisitionControl() {
    const control = controlFixture({ phase: "acquiring", tickets: [] });
    return {
      ...control,
      resources: control.resources.map((resource) => ({
        ...resource,
        xeroTenantId: null,
      })),
    };
  }
  beforeEach(() => {
    databaseMocks.transaction.mockImplementation(async (operation) =>
      operation({ xeroTenant: { findMany: async () => [] } })
    );
  });
  it("rejects a sentinel target replacement between read and atomic acquisition", async () => {
    const fixture = storeFixture(null);
    const store = new XeroCampaignStore(fixture.configuration);
    const original = store.command.bind(store);
    vi.spyOn(store, "command").mockImplementation((parts) => {
      if (parts[1]?.includes("local reservationCount")) {
        fixture.values.set(
          fixture.keys.sentinel,
          JSON.stringify({
            credentialDomainId: uuid(1),
            databaseTargetHash: `sha256:${"b".repeat(64)}`,
            version: 1,
          })
        );
      }
      return original(parts);
    });
    await expect(store.initialise(acquisitionControl())).rejects.toThrow(
      "xero_campaign_admission_denied"
    );
    expect(fixture.values.has(fixture.keys.control(campaign.runId))).toBe(
      false
    );
  });
  it("retains ordinary invocation ownership after accepted response until local work closes", async () => {
    const fixture = storeFixture(null);
    let markAccepted: () => void = () => {
      throw new Error("Missing acceptance barrier");
    };
    let releasePersistence: () => void = () => {
      throw new Error("Missing persistence barrier");
    };
    const accepted = new Promise<void>((resolve) => {
      markAccepted = resolve;
    });
    const persist = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    const ordinary = withXeroCampaignInvocation(
      functionId,
      scope,
      async () => {
        await withXeroCampaignProviderEffect(
          target,
          async () => new Response("accepted")
        );
        markAccepted();
        await persist;
        return "persisted";
      },
      "ordinary-worker",
      fixture.configuration
    );
    await accepted;
    expect(
      fixture.hashes.has(
        fixture.keys.ordinaryProviderAttempts(
          target.providerAppId,
          target.xeroTenantId
        )
      )
    ).toBe(false);
    await expect(
      initialiseXeroCampaign(acquisitionControl(), fixture.configuration)
    ).rejects.toThrow("xero_campaign_admission_denied");
    releasePersistence();
    await expect(ordinary).resolves.toBe("persisted");
    expect(fixture.hashes.size).toBe(0);
    await expect(
      initialiseXeroCampaign(acquisitionControl(), fixture.configuration)
    ).resolves.toMatchObject({ phase: "acquiring" });
  });
  it("retains uncertain local completion after an accepted provider response", async () => {
    const fixture = storeFixture(null);
    await expect(
      withXeroCampaignInvocation(
        functionId,
        scope,
        async () => {
          await withXeroCampaignProviderEffect(
            target,
            async () => new Response("accepted")
          );
          throw new Error("persistence failed");
        },
        "ordinary-worker",
        fixture.configuration
      )
    ).rejects.toThrow("persistence failed");
    const entries = fixture.hashes.get(
      fixture.keys.ordinaryInvocations(scope.organisationId)
    );
    expect(
      [...(entries?.values() ?? [])].map((raw) => JSON.parse(raw).state)
    ).toEqual(["uncertain"]);
    await expect(
      initialiseXeroCampaign(acquisitionControl(), fixture.configuration)
    ).rejects.toThrow("xero_campaign_admission_denied");
  });
  it.each([200, 401, 429])(
    "records caught local failure after provider status %s without changing Result",
    async (status) => {
      const fixture = storeFixture(null);
      const failure = { error: { code: "persistence_failed" }, ok: false };
      const result = await withXeroCampaignInvocation(
        functionId,
        scope,
        async () => {
          await withXeroCampaignProviderEffect(
            { ...target, method: "POST" },
            () => Promise.resolve(new Response(null, { status }))
          );
          return failure;
        },
        "ordinary-worker",
        fixture.configuration
      );
      expect(result).toBe(failure);
      const entries = [
        ...(fixture.hashes
          .get(fixture.keys.ordinaryInvocations(scope.organisationId))
          ?.values() ?? []),
      ].map((raw) => JSON.parse(raw));
      if (status === 200) {
        expect(entries).toMatchObject([
          {
            functionId,
            runtimeRevision: authority.candidateSha,
            state: "uncertain",
          },
        ]);
        expect(entries[0].startedAt).toEqual(expect.any(String));
        expect(entries[0].id).toEqual(expect.any(String));
        await expect(
          initialiseXeroCampaign(acquisitionControl(), fixture.configuration)
        ).rejects.toThrow();
      } else {
        expect(entries).toEqual([]);
      }
    }
  );
  it("denies invocation registration when reservation wins the race", async () => {
    const fixture = storeFixture(null);
    const store = new XeroCampaignStore(fixture.configuration);
    const original = store.command.bind(store);
    vi.spyOn(store, "command").mockImplementation((parts) => {
      if (parts[1]?.includes("local prior =")) {
        fixture.writeControl(controlFixture());
      }
      return original(parts);
    });
    await expect(store.beginOrdinaryInvocation(scope)).rejects.toThrow(
      "xero_campaign_admission_denied"
    );
    expect(fixture.hashes.size).toBe(0);
  });
  it("holds acquisition until a started ordinary response is complete", async () => {
    const fixture = storeFixture(null);
    let release: () => void = () => {
      throw new Error("Missing release");
    };
    let started: () => void = () => {
      throw new Error("Missing start");
    };
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ordinary = withXeroCampaignProviderEffect(target, async () => {
      started();
      await wait;
      return "response buffered";
    });
    await entered;
    const hash = fixture.hashes.get(
      fixture.keys.ordinaryProviderAttempts(
        target.providerAppId,
        target.xeroTenantId
      )
    );
    expect(
      [...(hash?.values() ?? [])].map((raw) => JSON.parse(raw).state)
    ).toEqual(["dispatched"]);
    await expect(
      initialiseXeroCampaign(acquisitionControl(), fixture.configuration)
    ).rejects.toThrow("xero_campaign_admission_denied");
    release();
    await expect(ordinary).resolves.toBe("response buffered");
    expect(fixture.hashes.size).toBe(0);
    await expect(
      initialiseXeroCampaign(acquisitionControl(), fixture.configuration)
    ).resolves.toMatchObject({ phase: "acquiring" });
    const late = vi.fn(async () => "late");
    await expect(withXeroCampaignProviderEffect(target, late)).rejects.toThrow(
      "xero_campaign_admission_denied"
    );
    expect(late).not.toHaveBeenCalled();
  });
  it("allows an unrelated tenant attempt while preserving the reserved tenant", async () => {
    const fixture = storeFixture();
    const other = { ...target, tenantHeader: uuid(90), xeroTenantId: uuid(90) };
    await expect(
      withXeroCampaignProviderEffect(other, async () => "unrelated")
    ).resolves.toBe("unrelated");
    await expect(
      withXeroCampaignProviderEffect(target, async () => "reserved")
    ).rejects.toThrow("xero_campaign_admission_denied");
    expect(fixture.hashes.size).toBe(0);
  });
  it("refuses completion after target or attempt identity changes", async () => {
    const fixture = storeFixture(null);
    const store = new XeroCampaignStore(fixture.configuration);
    const attempt = await store.beginOrdinaryProviderAttempt(
      target.providerAppId,
      target.xeroTenantId
    );
    await expect(
      store.finishOrdinaryProviderAttempt(
        { ...attempt, externalTenantId: uuid(90) },
        "completed"
      )
    ).rejects.toThrow("xero_campaign_admission_denied");
    fixture.values.set(
      fixture.keys.sentinel,
      JSON.stringify({
        credentialDomainId: uuid(1),
        databaseTargetHash: `sha256:${"b".repeat(64)}`,
        version: 1,
      })
    );
    await expect(
      store.finishOrdinaryProviderAttempt(attempt, "completed")
    ).rejects.toThrow("xero_campaign_admission_denied");
    expect(
      fixture.hashes.get(
        fixture.keys.ordinaryProviderAttempts(
          target.providerAppId,
          target.xeroTenantId
        )
      )?.size
    ).toBe(1);
  });
  it("fails closed when the durable ordinary attempt ledger reaches its cap", async () => {
    const fixture = storeFixture(null);
    fixture.hashes.set(
      fixture.keys.ordinaryProviderAttempts(
        target.providerAppId,
        target.xeroTenantId
      ),
      new Map(
        Array.from({ length: 2000 }, (_, index) => [String(index), "uncertain"])
      )
    );
    const operation = vi.fn(async () => "not dispatched");
    await expect(
      withXeroCampaignProviderEffect(target, operation)
    ).rejects.toThrow("xero_campaign_admission_denied");
    expect(operation).not.toHaveBeenCalled();
  });
  it("keeps an ambiguous ordinary server response uncertain", async () => {
    const fixture = storeFixture(null);
    const response = await withXeroCampaignProviderEffect(
      { ...target, method: "POST" },
      async () => new Response(null, { status: 503 })
    );
    expect(response.status).toBe(503);
    const hash = fixture.hashes.get(
      fixture.keys.ordinaryProviderAttempts(
        target.providerAppId,
        target.xeroTenantId
      )
    );
    expect(
      [...(hash?.values() ?? [])].map((raw) => JSON.parse(raw).state)
    ).toEqual(["uncertain"]);
  });
  it("retains an uncertain ordinary attempt and denies acquisition", async () => {
    const fixture = storeFixture(null);
    await expect(
      withXeroCampaignProviderEffect(target, () =>
        Promise.reject(new Error("response lost"))
      )
    ).rejects.toThrow("response lost");
    const hash = fixture.hashes.get(
      fixture.keys.ordinaryProviderAttempts(
        target.providerAppId,
        target.xeroTenantId
      )
    );
    expect(
      [...(hash?.values() ?? [])].map((raw) => JSON.parse(raw).state)
    ).toEqual(["uncertain"]);
    await expect(
      initialiseXeroCampaign(acquisitionControl(), fixture.configuration)
    ).rejects.toThrow("xero_campaign_admission_denied");
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

const supportedPayrollReads = [
  "/payroll.xro/1.0/Employees",
  "/payroll.xro/1.0/Employees?page=1",
  "/payroll.xro/1.0/Employees?page=200",
  "/payroll.xro/1.0/LeaveApplications/v2?page=2",
  "/payroll.xro/1.0/PayItems",
  `/payroll.xro/1.0/Employees/${uuid(20)}`,
  `/payroll.xro/1.0/LeaveApplications/${uuid(21)}`,
  "/payroll.xro/2.0/employees?page=1",
  `/payroll.xro/2.0/employees/${uuid(20)}/leave`,
  `/payroll.xro/2.0/employees/${uuid(20)}/leaveBalances`,
  `/payroll.xro/2.0/employees/${uuid(20)}/leave/${uuid(21)}`,
];
function payrollTarget(path: string, method = "GET") {
  return {
    kind: "tenant",
    method,
    providerAppId: "fixture-app",
    tenantHeader: uuid(4),
    url: `https://api.xero.com${path}`,
    xeroTenantId: uuid(4),
  };
}
function withProviderAuthority(
  mode: "worker" | "observer",
  operation: () => Promise<void>
) {
  const fixture = storeFixture();
  if (mode === "observer") {
    return withXeroCampaignObservation(
      authority,
      operation,
      fixture.configuration
    );
  }
  return withXeroCampaignInvocation(
    functionId,
    { ...scope, campaign },
    operation,
    "worker-1",
    fixture.configuration
  );
}
describe.each(["worker", "observer"] as const)(
  "exact %s provider routes",
  (mode) => {
    it.each(supportedPayrollReads)(
      "permits implemented regional GET %s",
      async (path) => {
        await withProviderAuthority(mode, () =>
          assertXeroCampaignProviderAccess(payrollTarget(path))
        );
      }
    );
    it.each([
      ["/payroll.xro/1.0/UnknownOperation", "GET"],
      ["/payroll.xro/1.0/Employees", "DELETE"],
      ["/payroll.xro/1.0/Employees", "POST"],
      ["/payroll.xro/1.0/Employees", "HEAD"],
      ["/payroll.xro/1.0/LeaveApplications", "POST"],
      [`/payroll.xro/1.0/LeaveApplications/${uuid(21)}/approve`, "POST"],
      [`/payroll.xro/1.0/LeaveApplications/${uuid(21)}/reject`, "POST"],
      [`/payroll.xro/1.0/Employees/${uuid(20)}/unreviewed`, "GET"],
      ["/payroll.xro/2.0/unknown", "GET"],
      [`/payroll.xro/2.0/employees/${uuid(20)}/leave`, "PATCH"],
      [
        `/payroll.xro/2.0/employees/${uuid(20)}/leave/${uuid(21)}/unknown`,
        "GET",
      ],
      ["/payroll.xro/1.0/Employees%2Funreviewed", "GET"],
      ["/payroll.xro/1.0/unreviewed/../Employees", "GET"],
      ["/payroll.xro/1.0/%2e%2e/1.0/Employees", "GET"],
      ["/payroll.xro/1.0/Employees/", "GET"],
      ["/payroll.xro/1.0/Employees?page=1&page=2", "GET"],
      ["/payroll.xro/1.0/Employees?page=1&unreviewed=true", "GET"],
      ["/payroll.xro/1.0/Employees?page=0", "GET"],
      ["/payroll.xro/1.0/Employees?page=201", "GET"],
      ["/payroll.xro/1.0/PayItems?page=1", "GET"],
    ])("denies unreviewed route or method %s %s", async (path, method) => {
      await withProviderAuthority(mode, async () => {
        await expect(
          assertXeroCampaignProviderAccess(payrollTarget(path, method))
        ).rejects.toThrow("xero_campaign_admission_denied");
      });
    });
  }
);

it.each([
  ["submit", "/payroll.xro/1.0/LeaveApplications"],
  ["approve", `/payroll.xro/1.0/LeaveApplications/${uuid(21)}/approve`],
  ["decline", `/payroll.xro/1.0/LeaveApplications/${uuid(21)}/reject`],
  ["withdraw", `/payroll.xro/1.0/LeaveApplications/${uuid(21)}/reject`],
])("preserves ordinary unreserved synchronous %s", async (_action, path) => {
  storeFixture(null);
  await expect(
    assertXeroCampaignProviderAccess(payrollTarget(path, "POST"))
  ).resolves.toBeUndefined();
});
it("preserves scoped token refresh POST while denying observer and campaign management authority", async () => {
  const token = {
    kind: "token",
    method: "POST",
    providerAppId: "fixture-app",
    url: "https://identity.xero.com/connect/token",
  };
  await withProviderAuthority("worker", async () => {
    await expect(
      assertXeroCampaignProviderAccess(token)
    ).resolves.toBeUndefined();
    await expect(
      assertXeroCampaignProviderAccess({ ...token, method: "GET" })
    ).rejects.toThrow();
    await expect(
      assertXeroCampaignProviderAccess({
        ...token,
        url: `${token.url}?unreviewed=true`,
      })
    ).rejects.toThrow();
    await expect(
      assertXeroCampaignProviderAccess({ ...token, kind: "app_management" })
    ).rejects.toThrow();
    await expect(
      assertXeroCampaignProviderAccess({
        ...token,
        kind: "app_management",
        method: "DELETE",
        url: `https://api.xero.com/connections/${uuid(20)}`,
      })
    ).rejects.toThrow();
  });
  await withProviderAuthority("observer", async () => {
    await expect(assertXeroCampaignProviderAccess(token)).rejects.toThrow();
  });
  storeFixture(null);
  await expect(
    assertXeroCampaignProviderAccess({ ...token, kind: "app_management" })
  ).resolves.toBeUndefined();
  await expect(
    assertXeroCampaignProviderAccess({
      ...token,
      kind: "app_management",
      method: "DELETE",
      url: `https://api.xero.com/connections/${uuid(20)}`,
    })
  ).resolves.toBeUndefined();
});

describe("authenticated campaign actions", () => {
  const actionId = "leave.approve";
  const userId = "user_owned";
  const actionInput = {
    campaign,
    clerkOrgId: scope.clerkOrgId,
    organisationId: scope.organisationId,
    target: { organisationId: scope.organisationId, recordId: uuid(50) },
    userId,
  };
  function setup() {
    const control = controlFixture({
      allowedFunctions: [actionId],
      sanctionedActors: [
        {
          actions: [actionId],
          clerkOrgId: scope.clerkOrgId,
          organisationId: scope.organisationId,
          userId,
        },
      ],
    });
    const targetHash = xeroCampaignActionTargetHash({
      clerkOrgId: actionInput.clerkOrgId,
      functionId: actionId,
      organisationId: actionInput.organisationId,
      target: actionInput.target,
      userId,
    });
    return storeFixture({
      ...control,
      tickets: control.tickets.map((ticket) => ({
        ...ticket,
        functionId: actionId,
        providerRequests: [
          {
            bodyHash: reference,
            maxAttempts: 1,
            method: "POST",
            url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications",
          },
        ],
        scheduledSlot: null,
        targetHash,
        userId,
      })),
    });
  }
  it("runs a distinct inline worker ticket and restores actor authority", async () => {
    const fixture = setup();
    fixture.writeControl({
      ...fixture.readControl(),
      allowedFunctions: [actionId, functionId],
    });
    await withXeroCampaignAction(actionId, actionInput, async () => {
      const value = await withXeroCampaignChildInvocation(
        functionId,
        scope,
        (payload) =>
          withXeroCampaignInvocation(functionId, payload, () =>
            Promise.resolve("child-result")
          )
      );
      expect(value).toBe("child-result");
      await assertXeroCampaignAccess(scope);
    });
    expect(fixture.readControl().tickets).toMatchObject([
      { functionId: actionId, outcome: "succeeded", userId },
      { functionId, outcome: "succeeded", userId: null },
    ]);
  });
  it("rejects an inline handler that fails to consume its worker ticket", async () => {
    const fixture = setup();
    fixture.writeControl({
      ...fixture.readControl(),
      allowedFunctions: [actionId, functionId],
    });
    await expect(
      withXeroCampaignAction(actionId, actionInput, () =>
        withXeroCampaignChildInvocation(functionId, scope, () =>
          Promise.resolve("unadmitted")
        )
      )
    ).rejects.toThrow("xero_campaign_admission_denied");
    expect(fixture.readControl().tickets.at(-1)?.outcome).toBe("reserved");
  });
  it.each([200, 401, 429, 500])(
    "only retries definite provider rejection status %s",
    async (status) => {
      const fixture = setup();
      fixture.writeControl({
        ...fixture.readControl(),
        tickets: fixture.readControl().tickets.map((ticket) => ({
          ...ticket,
          providerRequests: ticket.providerRequests?.map((request) => ({
            ...request,
            maxAttempts: 2,
          })),
        })),
      });
      const target = {
        bodyHash: reference,
        kind: "tenant",
        method: "POST",
        providerAppId: "fixture-app",
        tenantHeader: uuid(4),
        url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications",
        xeroTenantId: uuid(4),
      };
      await withXeroCampaignAction(actionId, actionInput, async () => {
        await withXeroCampaignProviderEffect(target, () =>
          Promise.resolve(new Response(null, { status }))
        );
        const second = vi.fn(() =>
          Promise.resolve(new Response(null, { status: 200 }))
        );
        if ([401, 429].includes(status)) {
          await withXeroCampaignProviderEffect(target, second);
          expect(second).toHaveBeenCalledOnce();
        } else {
          await expect(
            withXeroCampaignProviderEffect(target, second)
          ).rejects.toThrow();
          expect(second).not.toHaveBeenCalled();
        }
      });
      expect(fixture.readControl().effects[0]?.providerResponseStatus).toBe(
        status
      );
    }
  );
  it("permits ordinary manual action without a Xero binding under verified idle authority", async () => {
    storeFixture(null);
    databaseMocks.bindings.mockResolvedValue([]);
    const { campaign: _campaign, ...ordinaryInput } = actionInput;
    await expect(
      withXeroCampaignAction("availability.create", ordinaryInput, () =>
        Promise.resolve({ ok: true })
      )
    ).resolves.toEqual({ ok: true });
    expect(databaseMocks.bindings).not.toHaveBeenCalled();
  });
  it("denies an ordinary manual action on the reserved organisation", async () => {
    setup();
    const { campaign: _campaign, ...ordinaryInput } = actionInput;
    const operation = vi.fn(() => Promise.resolve());
    await expect(
      withXeroCampaignAction("availability.create", ordinaryInput, operation)
    ).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
  });
  it("hashes equivalent validated object fields deterministically", () => {
    expect(
      xeroCampaignActionTargetHash({
        clerkOrgId: actionInput.clerkOrgId,
        functionId: actionId,
        organisationId: actionInput.organisationId,
        target: actionInput.target,
        userId,
      })
    ).toBe(
      xeroCampaignActionTargetHash({
        clerkOrgId: scope.clerkOrgId,
        functionId: actionId,
        organisationId: scope.organisationId,
        target: { organisationId: scope.organisationId, recordId: uuid(50) },
        userId,
      })
    );
  });
  it("requires exact authenticated actor and target, with no operation on denial", async () => {
    setup();
    const operation = vi.fn(() => Promise.resolve("done"));
    await expect(
      withXeroCampaignAction(
        actionId,
        { ...actionInput, userId: "foreign" },
        operation
      )
    ).rejects.toThrow();
    await expect(
      withXeroCampaignAction(
        actionId,
        {
          ...actionInput,
          target: { ...actionInput.target, recordId: uuid(51) },
        },
        operation
      )
    ).rejects.toThrow();
    await expect(
      withXeroCampaignInvocation(actionId, { ...scope, campaign }, operation)
    ).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
    await expect(
      withXeroCampaignAction(actionId, actionInput, operation)
    ).resolves.toBe("done");
    await expect(
      withXeroCampaignAction(actionId, actionInput, operation)
    ).rejects.toThrow();
    expect(operation).toHaveBeenCalledOnce();
  });
  it("denies a stale actual database binding before action admission", async () => {
    setup();
    databaseMocks.bindings.mockResolvedValue([
      {
        binding_generation: 3,
        id: scope.xeroTenantId,
        xero_tenant_id: uuid(4),
      },
    ]);
    const operation = vi.fn(() => Promise.resolve());
    await expect(
      withXeroCampaignAction(actionId, actionInput, operation)
    ).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
  });
  it("admits only the exact serialised provider target within its durable attempt budget", async () => {
    const fixture = setup();
    const target = {
      bodyHash: reference,
      kind: "tenant",
      method: "POST",
      providerAppId: "fixture-app",
      tenantHeader: uuid(4),
      url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications",
      xeroTenantId: uuid(4),
    };
    await withXeroCampaignAction(actionId, actionInput, async () => {
      const dispatch = vi.fn(() => Promise.resolve(new Response("accepted")));
      await expect(
        withXeroCampaignProviderEffect(
          { ...target, bodyHash: `sha256:${"b".repeat(64)}` },
          dispatch
        )
      ).rejects.toThrow();
      expect(dispatch).not.toHaveBeenCalled();
      await withXeroCampaignProviderEffect(target, dispatch);
      await expect(
        withXeroCampaignProviderEffect(target, dispatch)
      ).rejects.toThrow();
      expect(dispatch).toHaveBeenCalledOnce();
    });
    expect(fixture.readControl().effects).toMatchObject([
      { outcome: "completed", providerRequest: "request:0" },
    ]);
  });
});

describe("intentional binding transition evidence", () => {
  const userId = "user_owned";
  const actionId = "xero.disconnect";
  const input = {
    campaign,
    clerkOrgId: scope.clerkOrgId,
    organisationId: scope.organisationId,
    target: { organisationId: scope.organisationId },
    userId,
  };
  function setup(selectedAction = actionId) {
    const control = controlFixture({
      allowedFunctions: [selectedAction],
      sanctionedActors: [
        {
          actions: [selectedAction],
          clerkOrgId: scope.clerkOrgId,
          organisationId: scope.organisationId,
          userId,
        },
      ],
    });
    const fixture = storeFixture({
      ...control,
      tickets: control.tickets.map((ticket) => ({
        ...ticket,
        functionId: selectedAction,
        scheduledSlot: null,
        targetHash: xeroCampaignActionTargetHash({
          clerkOrgId: input.clerkOrgId,
          functionId: selectedAction,
          organisationId: input.organisationId,
          target: input.target,
          userId,
        }),
        userId,
      })),
    });
    databaseMocks.transaction.mockImplementation((operation) =>
      operation({ xeroTenant: { findMany: databaseMocks.bindings } })
    );
    return fixture;
  }
  function retiredBinding() {
    return {
      active_slot: null,
      binding_generation: 3,
      id: scope.xeroTenantId,
      provider_app_id: "fixture-app",
      retired_at: new Date(),
      retirement_reason: "disconnected",
      xero_credential_owner_id: null,
      xero_tenant_id: uuid(4),
    };
  }
  it("reconciles the shipped tenant-selection action ID during graceful drain", async () => {
    const shippedAction = "xero.tenant-selection";
    const fixture = setup(shippedAction);
    await withXeroCampaignAction(shippedAction, input, async () => {
      await transitionXeroCampaign(
        campaign.runId,
        campaign.epoch,
        "draining",
        fixture.configuration
      );
      databaseMocks.bindings.mockResolvedValue([
        {
          ...retiredBinding(),
          active_slot: 1,
          retired_at: null,
          retirement_reason: null,
        },
      ]);
      await reconcileXeroCampaignActionBinding();
      await assertXeroCampaignAccess({ ...scope, bindingGeneration: 3 });
    });
    expect(fixture.readControl().bindingTransitions).toMatchObject([
      { next: { bindingGeneration: 3, bindingState: "active" } },
    ]);
    expect(fixture.readControl().tickets[0]).toMatchObject({
      functionId: shippedAction,
      outcome: "succeeded",
    });
  });
  it("records old and observed generations and retains ownership after disconnect", async () => {
    const fixture = setup();
    await withXeroCampaignAction(actionId, input, async () => {
      databaseMocks.bindings.mockResolvedValue([retiredBinding()]);
      await reconcileXeroCampaignActionBinding();
      await assertXeroCampaignAccess({ ...scope, bindingGeneration: 3 });
    });
    expect(fixture.readControl().bindingTransitions).toMatchObject([
      {
        dispatchId: campaign.dispatchId,
        next: { bindingGeneration: 3, bindingState: "retired" },
        previous: { bindingGeneration: 2 },
      },
    ]);
    expect(fixture.readControl().tickets[0]?.outcome).toBe("succeeded");
    expect(
      fixture.values.get(fixture.keys.organisation(scope.organisationId))
    ).toBe(campaign.runId);
  });
  it.each([
    "xero.oauth.start",
    "xero.tenant-selection",
    "leave.approve",
    "sync-xero-leave-records",
  ])(
    "retired binding admission is constrained for %s",
    async (nextFunction) => {
      const fixture = setup();
      await withXeroCampaignAction(actionId, input, async () => {
        databaseMocks.bindings.mockResolvedValue([retiredBinding()]);
        await reconcileXeroCampaignActionBinding();
      });
      const control = fixture.readControl();
      const worker = nextFunction.startsWith("sync-");
      fixture.writeControl({
        ...control,
        allowedFunctions: [nextFunction],
        sanctionedActors: [
          {
            actions: [nextFunction],
            clerkOrgId: scope.clerkOrgId,
            organisationId: scope.organisationId,
            userId,
          },
        ],
        tickets: control.tickets.map((ticket) => ({
          ...ticket,
          functionId: nextFunction,
          outcome: "reserved",
          targetHash: worker
            ? null
            : xeroCampaignActionTargetHash({
                clerkOrgId: input.clerkOrgId,
                functionId: nextFunction,
                organisationId: input.organisationId,
                target: input.target,
                userId,
              }),
          userId: worker ? null : userId,
        })),
      });
      const operation = vi.fn(() => Promise.resolve("admitted"));
      const result = worker
        ? withXeroCampaignInvocation(
            nextFunction,
            { ...scope, bindingGeneration: 3, campaign },
            operation
          )
        : withXeroCampaignAction(nextFunction, input, operation);
      if (
        ["xero.oauth.start", "xero.tenant-selection"].includes(nextFunction)
      ) {
        await expect(result).resolves.toBe("admitted");
      } else {
        await expect(result).rejects.toThrow();
        expect(operation).not.toHaveBeenCalled();
      }
    }
  );
  it("rejects inconsistent SQL lifecycle even when the binding identity is unchanged", async () => {
    const fixture = setup();
    await expect(
      withXeroCampaignAction(actionId, input, async () => {
        databaseMocks.bindings.mockResolvedValue([
          { ...retiredBinding(), active_slot: 1, binding_generation: 2 },
        ]);
        await reconcileXeroCampaignActionBinding();
      })
    ).rejects.toThrow("xero_campaign_admission_denied");
    expect(fixture.readControl().bindingTransitions).toBeUndefined();
    expect(fixture.readControl().effects).toMatchObject([
      { outcome: "uncertain" },
    ]);
  });
  it("keeps an uncertain operation when SQL changed but control CAS loses its snapshot", async () => {
    const fixture = setup();
    await expect(
      withXeroCampaignAction(actionId, input, async () => {
        databaseMocks.bindings.mockImplementation(() => {
          const latest = fixture.readControl();
          fixture.writeControl({
            ...latest,
            registrationObservedAt: new Date(
              Date.parse(latest.registrationObservedAt) + 1
            ).toISOString(),
          });
          return Promise.resolve([retiredBinding()]);
        });
        await reconcileXeroCampaignActionBinding();
      })
    ).rejects.toThrow("xero_campaign_admission_denied");
    expect(fixture.readControl().resources[0]?.bindingGeneration).toBe(2);
    expect(fixture.readControl().effects).toMatchObject([
      { outcome: "uncertain" },
    ]);
    const replay = vi.fn(() => Promise.resolve());
    await expect(
      withXeroCampaignAction(actionId, input, replay)
    ).rejects.toThrow();
    expect(replay).not.toHaveBeenCalled();
    expect(
      fixture.values.get(fixture.keys.organisation(scope.organisationId))
    ).toBe(campaign.runId);
  });
});

describe("graceful campaign drain", () => {
  it("lets the exact running invocation persist and finish after revocation but refuses new dispatch", async () => {
    const fixture = storeFixture();
    await withXeroCampaignInvocation(
      functionId,
      { ...scope, campaign },
      async () => {
        await transitionXeroCampaign(
          campaign.runId,
          campaign.epoch,
          "draining",
          fixture.configuration
        );
        const effect = vi.fn(() => Promise.resolve("persisted"));
        await expect(withXeroCampaignWrite(scope, effect)).resolves.toBe(
          "persisted"
        );
        expect(effect).toHaveBeenCalledOnce();
        const send = vi.fn(() => Promise.resolve({ ids: ["must-not-send"] }));
        await expect(
          dispatchXeroCampaignChild(functionId, scope, send)
        ).rejects.toThrow();
        expect(send).not.toHaveBeenCalled();
      },
      "worker-owned",
      fixture.configuration
    );
    expect(fixture.readControl().phase).toBe("draining");
    expect(fixture.readControl().tickets[0]?.outcome).toBe("succeeded");
  });
  it("does not let an existing invocation identity admit a new call after revocation", async () => {
    const fixture = storeFixture(controlFixture({ phase: "draining" }));
    const operation = vi.fn(() => Promise.resolve());
    await expect(
      withXeroCampaignInvocation(
        functionId,
        { ...scope, campaign },
        operation,
        "worker-owned",
        fixture.configuration
      )
    ).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
  });
});

describe("provider admission during graceful drain", () => {
  const target = {
    kind: "tenant",
    providerAppId: "fixture-app",
    tenantHeader: uuid(4),
    url: "https://api.xero.com/payroll.xro/1.0/Employees",
    xeroTenantId: uuid(4),
  };
  it.each(["before-check", "before-effect-cas"])(
    "prevents new provider dispatch when revoked %s",
    async (timing) => {
      const fixture = storeFixture();
      const transport = vi.fn(() => Promise.resolve(new Response("{}")));
      await withXeroCampaignInvocation(
        functionId,
        { ...scope, campaign },
        async () => {
          if (timing === "before-check") {
            await transitionXeroCampaign(
              campaign.runId,
              campaign.epoch,
              "draining",
              fixture.configuration
            );
          } else {
            const original = fixture.fetchImpl.getMockImplementation();
            fixture.fetchImpl.mockImplementation((url, init) => {
              const command: string[] = JSON.parse(String(init?.body));
              if (
                command[0] === "EVAL" &&
                command.some((part) => part.includes('"providerDispatch":true'))
              ) {
                fixture.writeControl({
                  ...fixture.readControl(),
                  phase: "draining",
                });
              }
              if (!original) {
                throw new Error("Missing fixture store transport");
              }
              return original(url, init);
            });
          }
          await expect(
            withXeroCampaignProviderEffect(target, transport)
          ).rejects.toThrow("xero_campaign_admission_denied");
          expect(transport).not.toHaveBeenCalled();
        },
        "worker-owned",
        fixture.configuration
      );
      expect(fixture.readControl().effects).toEqual([]);
      expect(fixture.readControl().tickets[0]?.outcome).toBe("succeeded");
    }
  );
});
