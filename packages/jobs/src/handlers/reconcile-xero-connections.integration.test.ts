// biome-ignore-all lint/style/useFilenamingConvention: Integration tests use the repository convention.
import { database } from "@repo/database";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { listResolvedXeroCleanupRequests } from "@repo/database/queries/xero-cleanup";
import {
  processXeroCleanupAttempt,
  reissueXeroCleanupAttempt,
  retireResolvedCleanupRequest,
} from "@repo/xero";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const management = vi.hoisted(() => ({
  delete: vi.fn(async () => ({ kind: "absent" as const })),
}));
vi.mock("../../../xero/src/oauth/management-client", () => ({
  deleteXeroConnection: management.delete,
}));
const fixture = allocateLiveTestFixture(
  "packages/jobs/src/handlers/reconcile-xero-connections.integration.test.ts"
);
const [tenant] = fixture.tenants;
if (!tenant) {
  throw new Error("Missing cleanup fixture scope");
}
const scope = {
  clerkOrgId: tenant.clerkOrgId,
  organisationId: tenant.organisationId,
};
const app = fixture.globalKey("provider_app");
const savedMode = process.env.XERO_REMOTE_CLEANUP_MODE;
const savedApp = process.env.XERO_CLIENT_ID;
async function clean() {
  const where = {
    clerk_org_id: scope.clerkOrgId,
    organisation_id: scope.organisationId,
  };
  await database.xeroCleanupAttempt.deleteMany({ where });
  await database.xeroCleanupRequest.deleteMany({ where });
  await database.xeroTenant.deleteMany({ where });
  await database.xeroConnection.deleteMany({ where });
  await database.organisation.deleteMany({
    where: { clerk_org_id: scope.clerkOrgId, id: scope.organisationId },
  });
}
beforeEach(async () => {
  await clean();
  management.delete.mockClear();
  process.env.XERO_CLIENT_ID = app;
  process.env.XERO_REMOTE_CLEANUP_MODE = "enabled";
});
afterAll(async () => {
  await clean();
  if (savedMode === undefined) {
    delete process.env.XERO_REMOTE_CLEANUP_MODE;
  } else {
    process.env.XERO_REMOTE_CLEANUP_MODE = savedMode;
  }
  if (savedApp === undefined) {
    delete process.env.XERO_CLIENT_ID;
  } else {
    process.env.XERO_CLIENT_ID = savedApp;
  }
  await database.$disconnect();
});
async function seed(
  state:
    | "pending"
    | "claimed"
    | "dispatching"
    | "unknown"
    | "cancelled" = "pending"
) {
  await database.organisation.create({
    data: {
      clerk_org_id: scope.clerkOrgId,
      country_code: "AU",
      id: scope.organisationId,
      name: "Cleanup worker fixture",
    },
  });
  const connection = await database.xeroConnection.create({
    data: {
      clerk_org_id: scope.clerkOrgId,
      disconnected_at: new Date(),
      expires_at: new Date(),
      id: fixture.id("connection"),
      organisation_id: scope.organisationId,
      status: "disconnected",
    },
  });
  const binding = await database.xeroTenant.create({
    data: {
      active_slot: 1,
      binding_generation: 2,
      clerk_org_id: scope.clerkOrgId,
      id: fixture.id("binding"),
      organisation_id: scope.organisationId,
      payroll_region: "AU",
      provider_app_id: app,
      xero_connection_id: connection.id,
      xero_tenant_id: fixture.id("external-tenant"),
    },
  });
  const request = await database.xeroCleanupRequest.create({
    data: {
      binding_generation: 2,
      clerk_org_id: scope.clerkOrgId,
      data_action_status: "not_requested",
      destructive: false,
      id: fixture.globalKey("cleanup_request"),
      organisation_id: scope.organisationId,
      requested_by_user_id: "fixture-user",
      xero_tenant_id: binding.id,
    },
  });
  const attempt = await database.xeroCleanupAttempt.create({
    data: {
      clerk_org_id: scope.clerkOrgId,
      expected_binding_generation: 2,
      id: fixture.globalKey("cleanup_attempt"),
      lease_expires_at:
        state === "dispatching" ? new Date(Date.now() - 1000) : null,
      lease_owner: state === "dispatching" ? "expired-worker" : null,
      organisation_id: scope.organisationId,
      provider_app_id: app,
      remote_connection_id: fixture.globalKey("provider_connection"),
      state,
      xero_cleanup_request_id: request.id,
    },
  });
  return { ...scope, attempt, attemptId: attempt.id, binding };
}
describe("fenced Xero cleanup worker", () => {
  it("leaves report-only pending requests untouched", async () => {
    const input = await seed();
    process.env.XERO_REMOTE_CLEANUP_MODE = "report_only";
    await processXeroCleanupAttempt(input, { deleteImpl: management.delete });
    expect(management.delete).not.toHaveBeenCalled();
  });
  it("never dispatches cancelled targets", async () => {
    const input = await seed("cancelled");
    await processXeroCleanupAttempt(input, { deleteImpl: management.delete });
    expect(management.delete).not.toHaveBeenCalled();
  });
  it("cancels a superseded generation without provider calls", async () => {
    const input = await seed();
    await database.xeroTenant.update({
      data: { binding_generation: 3 },
      where: {
        clerk_org_id: scope.clerkOrgId,
        id: input.binding.id,
        organisation_id: scope.organisationId,
      },
    });
    await processXeroCleanupAttempt(input, { deleteImpl: management.delete });
    expect(management.delete).not.toHaveBeenCalled();
    expect(
      (
        await database.xeroCleanupAttempt.findUniqueOrThrow({
          where: {
            clerk_org_id: scope.clerkOrgId,
            id: input.attemptId,
            organisation_id: scope.organisationId,
          },
        })
      ).state
    ).toBe("cancelled");
  });
  it("marks an expired dispatch unknown without retry", async () => {
    const input = await seed("dispatching");
    await processXeroCleanupAttempt(input, { deleteImpl: management.delete });
    expect(management.delete).not.toHaveBeenCalled();
    expect(
      (
        await database.xeroCleanupAttempt.findUniqueOrThrow({
          where: {
            clerk_org_id: scope.clerkOrgId,
            id: input.attemptId,
            organisation_id: scope.organisationId,
          },
        })
      ).state
    ).toBe("unknown");
  });
  it("recovers a persisted final confirmation after retirement failure without another provider call", async () => {
    const input = await seed();
    const confirmed = await database.xeroCleanupAttempt.updateMany({
      data: { outcome_reason: "absent", state: "confirmed_absent" },
      where: {
        clerk_org_id: scope.clerkOrgId,
        id: input.attemptId,
        organisation_id: scope.organisationId,
      },
    });
    expect(confirmed.count).toBe(1);
    const retirementScope = {
      ...scope,
      requestId: input.attempt.xero_cleanup_request_id,
    };
    // The lazy proxy resolves property reads but has no method descriptors to spy on.
    const resolvedDatabase = globalThis.__teamCalendarDatabase;
    if (!resolvedDatabase) {
      throw new Error("Expected the seeded database client to be initialised");
    }
    const failed = vi
      .spyOn(resolvedDatabase, "$transaction")
      .mockRejectedValueOnce(new Error("retirement interrupted"));
    try {
      await expect(
        retireResolvedCleanupRequest(retirementScope)
      ).rejects.toThrow("retirement interrupted");
      expect(failed).toHaveBeenCalledTimes(1);
    } finally {
      failed.mockRestore();
    }
    expect(
      await database.xeroCleanupAttempt.findFirstOrThrow({
        where: {
          clerk_org_id: scope.clerkOrgId,
          id: input.attemptId,
          organisation_id: scope.organisationId,
        },
      })
    ).toMatchObject({ outcome_reason: "absent", state: "confirmed_absent" });
    expect(
      await database.xeroTenant.findFirstOrThrow({
        where: {
          clerk_org_id: scope.clerkOrgId,
          id: input.binding.id,
          organisation_id: scope.organisationId,
        },
      })
    ).toMatchObject({
      active_slot: 1,
      binding_generation: 2,
      retired_at: null,
    });
    const requests = await listResolvedXeroCleanupRequests({ limit: 50 });
    expect(requests).toContainEqual(retirementScope);
    process.env.XERO_REMOTE_CLEANUP_MODE = "report_only";
    await retireResolvedCleanupRequest(retirementScope);
    const retired = await database.xeroTenant.findFirstOrThrow({
      where: {
        clerk_org_id: scope.clerkOrgId,
        id: input.binding.id,
        organisation_id: scope.organisationId,
      },
    });
    expect(retired).toMatchObject({
      active_slot: null,
      binding_generation: 2,
      retirement_reason: "disconnected",
    });
    expect(retired.retired_at).not.toBeNull();
    await retireResolvedCleanupRequest(retirementScope);
    expect(
      (
        await database.xeroTenant.findFirstOrThrow({
          where: {
            clerk_org_id: scope.clerkOrgId,
            id: input.binding.id,
            organisation_id: scope.organisationId,
          },
        })
      ).retired_at
    ).toEqual(retired.retired_at);
    expect(await listResolvedXeroCleanupRequests()).not.toContainEqual(
      retirementScope
    );
    expect(management.delete).not.toHaveBeenCalled();
  });
  it.each([
    "unknown",
    "changed_generation",
    "reconnected",
    "empty",
    "foreign_scope",
  ] as const)(
    "does not release %s reservations from terminal recovery",
    async (condition) => {
      const input = await seed(
        condition === "unknown" ? "unknown" : "cancelled"
      );
      if (condition === "changed_generation") {
        await database.xeroTenant.updateMany({
          data: { binding_generation: 3 },
          where: {
            clerk_org_id: scope.clerkOrgId,
            id: input.binding.id,
            organisation_id: scope.organisationId,
          },
        });
      } else if (condition === "reconnected") {
        await database.xeroConnection.updateMany({
          data: { disconnected_at: null, status: "active" },
          where: {
            clerk_org_id: scope.clerkOrgId,
            id: input.binding.xero_connection_id,
            organisation_id: scope.organisationId,
          },
        });
      } else if (condition === "empty") {
        await database.xeroCleanupAttempt.deleteMany({
          where: {
            clerk_org_id: scope.clerkOrgId,
            id: input.attemptId,
            organisation_id: scope.organisationId,
          },
        });
      }
      const request = {
        ...scope,
        requestId: input.attempt.xero_cleanup_request_id,
      };
      if (condition === "foreign_scope") {
        await retireResolvedCleanupRequest({
          ...request,
          organisationId:
            fixture.tenants[1]?.organisationId ?? input.binding.id,
        });
        await retireResolvedCleanupRequest({
          ...request,
          clerkOrgId: fixture.tenants[1]?.clerkOrgId ?? "foreign-fixture",
        });
      } else {
        expect(await listResolvedXeroCleanupRequests()).not.toContainEqual(
          request
        );
        await retireResolvedCleanupRequest(request);
      }
      expect(
        await database.xeroTenant.findFirstOrThrow({
          where: {
            clerk_org_id: scope.clerkOrgId,
            id: input.binding.id,
            organisation_id: scope.organisationId,
          },
        })
      ).toMatchObject({ active_slot: 1, retired_at: null });
      expect(management.delete).not.toHaveBeenCalled();
    }
  );
  it("two concurrent workers dispatch at most once", async () => {
    const input = await seed();
    management.delete.mockImplementationOnce(async () => {
      const persisted = await database.xeroCleanupAttempt.findFirstOrThrow({
        where: {
          clerk_org_id: scope.clerkOrgId,
          id: input.attemptId,
          organisation_id: scope.organisationId,
        },
      });
      expect(persisted.state).toBe("dispatching");
      expect(persisted.dispatched_at).not.toBeNull();
      expect(persisted.lease_owner).not.toBeNull();
      expect(persisted.lease_expires_at?.getTime()).toBeGreaterThan(Date.now());
      return { kind: "absent" };
    });
    await Promise.all([
      processXeroCleanupAttempt(input, { deleteImpl: management.delete }),
      processXeroCleanupAttempt(input, { deleteImpl: management.delete }),
    ]);
    expect(management.delete).toHaveBeenCalledTimes(1);
    const outcome = await database.xeroCleanupAttempt.findFirstOrThrow({
      where: {
        clerk_org_id: scope.clerkOrgId,
        id: input.attemptId,
        organisation_id: scope.organisationId,
      },
    });
    expect(outcome.state).toBe("confirmed_absent");
  });
  it.each(["changed_owner", "expired_lease"] as const)(
    "rejects a stale result after %s without retiring the binding",
    async (leaseChange) => {
      const input = await seed();
      management.delete.mockImplementationOnce(async () => {
        const persisted = await database.xeroCleanupAttempt.findFirstOrThrow({
          where: {
            clerk_org_id: scope.clerkOrgId,
            id: input.attemptId,
            organisation_id: scope.organisationId,
          },
        });
        expect(persisted.state).toBe("dispatching");
        expect(persisted.dispatched_at).not.toBeNull();
        await database.xeroCleanupAttempt.updateMany({
          data:
            leaseChange === "changed_owner"
              ? { lease_owner: "replacement-worker" }
              : { lease_expires_at: new Date(Date.now() - 1000) },
          where: {
            clerk_org_id: scope.clerkOrgId,
            id: input.attemptId,
            lease_owner: persisted.lease_owner,
            organisation_id: scope.organisationId,
            state: "dispatching",
          },
        });
        return { kind: "absent" };
      });
      await processXeroCleanupAttempt(input, { deleteImpl: management.delete });
      const attempted = await database.xeroCleanupAttempt.findFirstOrThrow({
        where: {
          clerk_org_id: scope.clerkOrgId,
          id: input.attemptId,
          organisation_id: scope.organisationId,
        },
      });
      expect(attempted.state).toBe("dispatching");
      const reserved = await database.xeroTenant.findFirstOrThrow({
        where: {
          clerk_org_id: scope.clerkOrgId,
          id: input.binding.id,
          organisation_id: scope.organisationId,
        },
      });
      expect(reserved.active_slot).toBe(1);
      expect(reserved.retired_at).toBeNull();
      expect(reserved.binding_generation).toBe(
        input.binding.binding_generation
      );
      await processXeroCleanupAttempt(input, {
        deleteImpl: management.delete,
        now: () => new Date(Date.now() + 121_000),
      });
      const expired = await database.xeroCleanupAttempt.findFirstOrThrow({
        where: {
          clerk_org_id: scope.clerkOrgId,
          id: input.attemptId,
          organisation_id: scope.organisationId,
        },
      });
      expect(expired.state).toBe("unknown");
      expect(management.delete).toHaveBeenCalledTimes(1);
      const stillReserved = await database.xeroTenant.findFirstOrThrow({
        where: {
          clerk_org_id: scope.clerkOrgId,
          id: input.binding.id,
          organisation_id: scope.organisationId,
        },
      });
      expect(stillReserved.active_slot).toBe(1);
      expect(stillReserved.retired_at).toBeNull();
    }
  );
  it("does not steal a live claim", async () => {
    const input = await seed("claimed");
    await database.xeroCleanupAttempt.update({
      data: {
        lease_expires_at: new Date(Date.now() + 120_000),
        lease_owner: "other-worker",
      },
      where: {
        clerk_org_id: scope.clerkOrgId,
        id: input.attemptId,
        organisation_id: scope.organisationId,
      },
    });
    await processXeroCleanupAttempt(input, { deleteImpl: management.delete });
    expect(management.delete).not.toHaveBeenCalled();
  });
  it("an explicit same-target unknown reissue confirms absence", async () => {
    const input = await seed("unknown");
    const result = await reissueXeroCleanupAttempt({
      ...input,
      confirmReissue: true,
      expectedBindingGeneration: 2,
      expectedProviderAppId: app,
      expectedRemoteConnectionId: input.attempt.remote_connection_id,
      operatorUserId: "fixture-operator",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.remoteStatus).toBe("confirmed_absent");
    }
    const retired = await database.xeroTenant.findFirstOrThrow({
      where: {
        clerk_org_id: scope.clerkOrgId,
        id: input.binding.id,
        organisation_id: scope.organisationId,
      },
    });
    expect(retired.active_slot).toBeNull();
    expect(retired.retired_at).not.toBeNull();
    expect(retired.binding_generation).toBe(input.binding.binding_generation);
  });
});
