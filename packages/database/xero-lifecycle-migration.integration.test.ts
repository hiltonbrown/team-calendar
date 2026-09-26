// biome-ignore-all lint/style/useFilenamingConvention: Integration tests use the repository convention.
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { database, payroll_region } from "./index.js";
import { allocateLiveTestFixture } from "./src/live-test-fixture";
import {
  claimXeroCleanupAttempt,
  markXeroCleanupAttemptDispatching,
  recordXeroCleanupAttemptOutcome,
} from "./src/queries/xero-cleanup";
import { applyVerifiedXeroCredentialOwnerAttachment } from "./src/queries/xero-credential-owner";
import { captureXeroCredentialIdentitySnapshot } from "./src/xero-credential-identity-artifact";
import { planXeroCredentialOwnerBackfill } from "./src/xero-credential-owner-backfill";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/database/xero-lifecycle-migration.integration.test.ts"
);
const providerAppId = fixture.globalKey("provider_app");
const tenantId = fixture.id("provider-tenant");
const tenantScopes = fixture.tenants.map((tenant) => tenant.clerkOrgId);
const ACTIVE_SLOT_CHECK = /xero_tenants_active_slot_check/;
const sqlPool = new Pool({
  connectionString:
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  max: 2,
});

const constraintName = (error: unknown): string | null => {
  if (
    typeof error === "object" &&
    error !== null &&
    "constraint" in error &&
    typeof error.constraint === "string"
  ) {
    return error.constraint;
  }
  return null;
};

const captureError = async (operation: Promise<unknown>): Promise<unknown> => {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("Expected database operation to fail");
};

async function cleanTestData() {
  const where = { clerk_org_id: { in: tenantScopes } };
  await database.xeroCleanupAttempt.deleteMany({ where });
  await database.xeroCleanupRequest.deleteMany({ where });
  await database.xeroTenant.deleteMany({ where });
  await database.xeroRefreshAttempt.deleteMany({
    where: { owner: { provider_app_id: providerAppId } },
  });
  await database.xeroProviderConnection.deleteMany({
    where: { provider_app_id: providerAppId },
  });
  await database.xeroCredentialOwner.deleteMany({
    where: { provider_app_id: providerAppId },
  });
  await database.xeroConnection.deleteMany({ where });
  await database.organisation.deleteMany({ where });
}

async function createSlot(index: number) {
  const tenant = fixture.tenants[index];
  if (!tenant) {
    throw new Error("Fixture tenant slot is missing");
  }
  await database.organisation.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Binding fixture ${index}`,
    },
  });
  const connection = await database.xeroConnection.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      expires_at: new Date(Date.now() + 60_000),
      id: fixture.id("connection", index),
      organisation_id: tenant.organisationId,
    },
  });
  return { connection, tenant };
}

async function createBinding(
  index: number,
  input: { activeSlot: 1 | null; providerAppId?: string; tenantId?: string }
) {
  const slot = await createSlot(index);
  return database.xeroTenant.create({
    data: {
      active_slot: input.activeSlot,
      clerk_org_id: slot.tenant.clerkOrgId,
      id: fixture.id("binding", index),
      organisation_id: slot.tenant.organisationId,
      payroll_region: payroll_region.AU,
      provider_app_id: input.providerAppId ?? providerAppId,
      xero_connection_id: slot.connection.id,
      xero_tenant_id: input.tenantId ?? tenantId,
    },
  });
}

beforeEach(cleanTestData);
afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
  await sqlPool.end();
});

describe("Xero tenant binding reservation constraints", () => {
  it("rejects direct rebinding while accepting a same-file update", async () => {
    const binding = await createBinding(0, { activeSlot: 1 });
    const error = await captureError(
      sqlPool.query(
        "UPDATE xero_tenants SET xero_tenant_id = $1 WHERE id = $2",
        [fixture.id("unreserved-provider-tenant"), binding.id]
      )
    );
    expect(constraintName(error)).toBe("xero_tenants_xero_tenant_id_immutable");

    const persisted = await database.xeroTenant.findUniqueOrThrow({
      where: { id: binding.id },
    });
    expect(persisted.id).toBe(binding.id);
    expect(persisted.xero_tenant_id).toBe(tenantId);

    const sameFile = await sqlPool.query(
      "UPDATE xero_tenants SET xero_tenant_id = $1 WHERE id = $2 RETURNING id, xero_tenant_id",
      [tenantId, binding.id]
    );
    expect(sameFile.rows[0]).toEqual({
      id: binding.id,
      xero_tenant_id: tenantId,
    });
  });

  it.each([0, 2, -1])("rejects active_slot %i", async (activeSlot) => {
    const binding = await createBinding(0, { activeSlot: null });
    await expect(
      database.xeroTenant.update({
        data: { active_slot: activeSlot },
        where: { id: binding.id },
      })
    ).rejects.toThrow(ACTIVE_SLOT_CHECK);
  });

  it("accepts active_slot 1 and NULL", async () => {
    const binding = await createBinding(0, { activeSlot: 1 });
    const retired = await database.xeroTenant.update({
      data: { active_slot: null },
      where: { id: binding.id },
    });
    expect(retired.active_slot).toBeNull();
  });

  it("rejects two reserved rows for one provider app and Xero file", async () => {
    await createBinding(0, { activeSlot: 1 });
    const slot = await createSlot(1);
    const error = await captureError(
      sqlPool.query(
        `INSERT INTO xero_tenants
          (id, clerk_org_id, organisation_id, xero_connection_id, xero_tenant_id, payroll_region, provider_app_id, active_slot, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1, now(), now())`,
        [
          fixture.id("binding", 1),
          slot.tenant.clerkOrgId,
          slot.tenant.organisationId,
          slot.connection.id,
          tenantId,
          payroll_region.AU,
          providerAppId,
        ]
      )
    );
    expect(constraintName(error)).toBe("xero_tenants_reserved_binding_key");
  });

  it("allows two retired rows alongside one reserved row", async () => {
    await createBinding(0, { activeSlot: null });
    await createBinding(1, { activeSlot: null });
    await createBinding(2, { activeSlot: 1 });
    expect(
      await database.xeroTenant.count({
        where: { provider_app_id: providerAppId, xero_tenant_id: tenantId },
      })
    ).toBe(3);
  });

  it("allows the same Xero file under another provider app", async () => {
    await createBinding(0, { activeSlot: 1 });
    await createBinding(1, {
      activeSlot: 1,
      providerAppId: fixture.globalKey("provider_app", 1),
    });
    expect(
      await database.xeroTenant.count({ where: { xero_tenant_id: tenantId } })
    ).toBe(2);
  });

  it("allows exactly one of two concurrent reservations", async () => {
    const [first, second] = await Promise.all([createSlot(0), createSlot(1)]);
    const clients = await Promise.all([sqlPool.connect(), sqlPool.connect()]);
    const reserve = async (
      client: PoolClient,
      slot: Awaited<ReturnType<typeof createSlot>>,
      index: number
    ) => {
      await client.query("BEGIN");
      try {
        await client.query(
          "SELECT id FROM organisations WHERE id = $1 FOR UPDATE",
          [first.tenant.organisationId]
        );
        const result = await client.query(
          `INSERT INTO xero_tenants
            (id, clerk_org_id, organisation_id, xero_connection_id, xero_tenant_id, payroll_region, provider_app_id, active_slot, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1, now(), now())
           RETURNING id`,
          [
            fixture.id("binding", index),
            slot.tenant.clerkOrgId,
            slot.tenant.organisationId,
            slot.connection.id,
            tenantId,
            payroll_region.AU,
            providerAppId,
          ]
        );
        await client.query("COMMIT");
        return result.rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    };

    let outcomes: PromiseSettledResult<unknown>[];
    try {
      outcomes = await Promise.allSettled([
        reserve(clients[0], first, 0),
        reserve(clients[1], second, 1),
      ]);
    } finally {
      for (const client of clients) {
        client.release();
      }
    }
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled")
    ).toHaveLength(1);
    const rejected = outcomes.filter(
      (outcome) => outcome.status === "rejected"
    );
    expect(rejected).toHaveLength(1);
    expect(constraintName(rejected[0]?.reason)).toBe(
      "xero_tenants_reserved_binding_key"
    );
  });
});

describe("Xero credential owner migration", () => {
  it("limits system-table scope exceptions to the explicit allowlist", async () => {
    const result = await sqlPool.query<{ table_name: string }>(`
      SELECT t.table_name FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name
        AND c.column_name = 'clerk_org_id'
      ) ORDER BY t.table_name
    `);
    // Existing global catalogue tables and Prisma bookkeeping, plus only these three exceptions.
    expect(result.rows.map((row) => row.table_name)).toEqual([
      "_prisma_migrations",
      "plan_limits",
      "plans",
      "xero_credential_owners",
      "xero_provider_connections",
      "xero_refresh_attempts",
    ]);
  });

  it("attaches a verified expired singleton without changing payroll identity", async () => {
    const binding = await createBinding(0, { activeSlot: 1 });
    const plan = planXeroCredentialOwnerBackfill(
      [binding],
      [{ tenantId: binding.id, xeroUserId: fixture.id("authoriser") }],
      providerAppId
    );
    expect(plan.attachments).toHaveLength(1);
    const owner = await database.xeroCredentialOwner.create({
      data: {
        access_token_auth_tag: "synthetic-tag",
        access_token_encrypted: "synthetic-ciphertext",
        access_token_iv: "synthetic-iv",
        granted_scopes: [],
        id: fixture.globalKey("credential_owner"),
        identity_evidence: "legacy_access_token_jwt",
        provider_app_id: providerAppId,
        refresh_token_auth_tag: "synthetic-tag",
        refresh_token_encrypted: "synthetic-ciphertext",
        refresh_token_iv: "synthetic-iv",
        token_expires_at: new Date(Date.now() - 60_000),
        token_key_version: 1,
        usability: "usable",
        xero_user_id: fixture.id("authoriser"),
      },
    });
    const attached = await database.xeroTenant.update({
      data: { xero_credential_owner_id: owner.id },
      include: { credential_owner: true },
      where: {
        clerk_org_id: binding.clerk_org_id,
        id: binding.id,
        organisation_id: binding.organisation_id,
      },
    });
    expect(attached.credential_owner?.usability).toBe("usable");
    expect(attached.xero_tenant_id).toBe(binding.xero_tenant_id);
    expect(
      planXeroCredentialOwnerBackfill(
        [attached],
        [{ tenantId: binding.id, xeroUserId: owner.xero_user_id }],
        providerAppId
      ).attachments
    ).toEqual([]);
  });
});

describe("Xero cleanup lifecycle compare-and-set", () => {
  async function createCleanup() {
    const binding = await createBinding(0, { activeSlot: 1 });
    const scope = {
      clerkOrgId: binding.clerk_org_id,
      organisationId: binding.organisation_id,
    };
    const request = await database.xeroCleanupRequest.create({
      data: {
        binding_generation: binding.binding_generation,
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
        expected_binding_generation: binding.binding_generation,
        id: fixture.globalKey("cleanup_attempt"),
        organisation_id: scope.organisationId,
        provider_app_id: providerAppId,
        remote_connection_id: fixture.id("remote-cleanup"),
        xero_cleanup_request_id: request.id,
      },
    });
    return { ...scope, attempt, attemptId: attempt.id, request };
  }
  it("allows exactly one live lease and rejects stale outcomes and cross-scope claims", async () => {
    const input = await createCleanup();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + 120_000);
    const claims = await Promise.all(
      ["worker-a", "worker-b"].map((leaseOwner) =>
        claimXeroCleanupAttempt({ ...input, leaseExpiresAt, leaseOwner, now })
      )
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    const owner = claims[0] ? "worker-a" : "worker-b";
    expect(
      await claimXeroCleanupAttempt({
        ...input,
        clerkOrgId: "unowned",
        leaseExpiresAt,
        leaseOwner: owner,
        now,
      })
    ).toBe(false);
    expect(
      await markXeroCleanupAttemptDispatching({
        ...input,
        deadlineAt: new Date(now.getTime() + 60_000),
        leaseOwner: owner,
        now,
      })
    ).toBe(true);
    expect(
      await recordXeroCleanupAttemptOutcome({
        ...input,
        leaseOwner: "stale-worker",
        now,
        state: "confirmed_absent",
      })
    ).toBe(false);
    expect(
      await recordXeroCleanupAttemptOutcome({
        ...input,
        leaseOwner: owner,
        now: new Date(leaseExpiresAt.getTime() + 1),
        state: "confirmed_absent",
      })
    ).toBe(false);
    expect(
      await recordXeroCleanupAttemptOutcome({
        ...input,
        leaseOwner: owner,
        now,
        outcomeReason: "absent",
        state: "confirmed_absent",
      })
    ).toBe(true);
  });
  it("enforces one attempt per frozen request and remote connection", async () => {
    const input = await createCleanup();
    await expect(
      database.xeroCleanupAttempt.create({
        data: {
          clerk_org_id: input.clerkOrgId,
          expected_binding_generation:
            input.attempt.expected_binding_generation,
          id: fixture.globalKey("cleanup_attempt", 1),
          organisation_id: input.organisationId,
          provider_app_id: providerAppId,
          remote_connection_id: input.attempt.remote_connection_id,
          xero_cleanup_request_id: input.request.id,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("verified credential snapshot application", () => {
  async function prepare() {
    const binding = await createBinding(0, { activeSlot: 1 });
    const connection = await database.xeroConnection.update({
      data: {
        access_token_auth_tag: "snapshot-access-tag",
        access_token_encrypted: "snapshot-access-ciphertext",
        access_token_iv: "snapshot-access-iv",
        expires_at: new Date(Date.now() - 60_000),
        refresh_token_auth_tag: "snapshot-refresh-tag",
        refresh_token_encrypted: "snapshot-refresh-ciphertext",
        refresh_token_iv: "snapshot-refresh-iv",
        status: "active",
        token_key_version: 1,
      },
      where: {
        clerk_org_id: binding.clerk_org_id,
        id: binding.xero_connection_id,
        organisation_id: binding.organisation_id,
      },
    });
    const identity = captureXeroCredentialIdentitySnapshot(
      { ...binding, xero_connection: connection },
      fixture.id("verified-authoriser")
    );
    return {
      binding,
      connection,
      input: { identity, identityGroup: [identity], providerAppId },
    };
  }
  it("applies the exact verified expired snapshot and keeps a rerun idempotent", async () => {
    const { binding, connection, input } = await prepare();
    const result = await applyVerifiedXeroCredentialOwnerAttachment(input, {
      createOwnerId: () => fixture.globalKey("credential_owner"),
    });
    expect(result).toEqual({ ok: true, value: { attached: true } });
    const attached = await database.xeroTenant.findFirstOrThrow({
      where: {
        clerk_org_id: binding.clerk_org_id,
        id: binding.id,
        organisation_id: binding.organisation_id,
      },
    });
    expect(attached).toMatchObject({
      binding_generation: binding.binding_generation,
      xero_credential_owner_id: fixture.globalKey("credential_owner"),
      xero_tenant_id: binding.xero_tenant_id,
    });
    const owner = await database.xeroCredentialOwner.findUniqueOrThrow({
      where: { id: fixture.globalKey("credential_owner") },
    });
    expect(owner).toMatchObject({
      access_token_encrypted: connection.access_token_encrypted,
      refresh_token_encrypted: connection.refresh_token_encrypted,
      token_expires_at: connection.expires_at,
      usability: "usable",
      xero_user_id: input.identity.xeroUserId,
    });
    expect(
      planXeroCredentialOwnerBackfill(
        [attached],
        [input.identity],
        providerAppId
      ).attachments
    ).toEqual([]);
    expect(
      await database.xeroCredentialOwner.count({
        where: { provider_app_id: providerAppId },
      })
    ).toBe(1);
  });
  it.each([
    "reauthorisation",
    "key_version",
    "generation",
    "retired",
    "disconnected",
    "foreign_scope",
  ] as const)(
    "rejects a stale %s snapshot without creating or attaching an owner",
    async (change) => {
      const { binding, input } = await prepare();
      const where = {
        clerk_org_id: binding.clerk_org_id,
        id: binding.xero_connection_id,
        organisation_id: binding.organisation_id,
      };
      if (change === "reauthorisation") {
        await database.xeroConnection.update({
          data: {
            access_token_encrypted: "different-authoriser-ciphertext",
            refresh_token_encrypted: "different-authoriser-refresh",
          },
          where,
        });
      } else if (change === "key_version") {
        await database.xeroConnection.update({
          data: { token_key_version: 2 },
          where,
        });
      } else if (change === "generation" || change === "retired") {
        await database.xeroTenant.update({
          data:
            change === "generation"
              ? { binding_generation: { increment: 1 } }
              : { active_slot: null, retired_at: new Date() },
          where: { ...where, id: binding.id },
        });
      } else if (change === "disconnected") {
        await database.xeroConnection.update({
          data: { disconnected_at: new Date(), status: "disconnected" },
          where,
        });
      } else {
        const [, foreign] = fixture.tenants;
        if (!foreign) {
          throw new Error("Missing foreign fixture scope");
        }
        input.identity = {
          ...input.identity,
          clerkOrgId: foreign.clerkOrgId,
          organisationId: foreign.organisationId,
        };
        input.identityGroup = [input.identity];
      }
      const before = await database.xeroConnection.findFirstOrThrow({ where });
      expect(
        await applyVerifiedXeroCredentialOwnerAttachment(input, {
          createOwnerId: () => fixture.globalKey("credential_owner"),
        })
      ).toMatchObject({ error: { code: "conflict" }, ok: false });
      expect(
        await database.xeroCredentialOwner.count({
          where: { provider_app_id: providerAppId },
        })
      ).toBe(0);
      expect(
        await database.xeroTenant.findFirstOrThrow({
          where: {
            clerk_org_id: binding.clerk_org_id,
            id: binding.id,
            organisation_id: binding.organisation_id,
          },
        })
      ).toMatchObject({ xero_credential_owner_id: null });
      expect(await database.xeroConnection.findFirstOrThrow({ where })).toEqual(
        before
      );
    }
  );
});
