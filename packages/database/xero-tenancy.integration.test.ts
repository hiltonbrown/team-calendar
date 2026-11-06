import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import type { Prisma } from "./generated/client";
import {
  listDueXeroAuthorisations,
  saveXeroAuthorisation,
} from "./src/queries/xero-authorisation";
import { getScopedXeroConnection } from "./src/queries/xero-connections";
import { advanceXeroSyncCursor } from "./src/queries/xero-sync-cursors";
import {
  TenantMismatchError,
  withTenantDb,
  withTenantDb as withTestTenantDb,
} from "./src/tenant-db";
import {
  createXeroAuthorisationFixture,
  createXeroConnectionFixture,
  xeroSimplificationFixture,
} from "./src/test-fixtures/xero-simplification-fixture";

const { database, fixture: ownedFixture } = xeroSimplificationFixture(
  "packages/database/xero-tenancy.integration.test.ts"
);
const [primaryTenant] = ownedFixture.tenants;
if (!primaryTenant) {
  throw new Error("Fixture tenant slot is not allocated");
}
const maintenanceNow = new Date("2026-10-07T00:00:00.000Z");
const fortyFiveDaysAgo = new Date(
  maintenanceNow.getTime() - 45 * 24 * 60 * 60 * 1000
);
afterAll(() => database.$disconnect());
async function rolledBack(
  work: (tx: Prisma.TransactionClient) => Promise<void>
) {
  await database
    .$transaction(async (tx) => {
      await work(tx);
      throw new Error("fixture rollback");
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== "fixture rollback") {
        throw error;
      }
    });
}

test("dormant maintenance becomes due exactly 45 days after successful rotation", async () => {
  await rolledBack(async (tx) => {
    const fixtures = await Promise.all([
      createXeroConnectionFixture(tx, ownedFixture, 0),
      createXeroConnectionFixture(tx, ownedFixture, 1),
      createXeroConnectionFixture(tx, ownedFixture, 2),
    ]);
    for (const [index, fixture] of fixtures.entries()) {
      await tx.xeroAuthorisation.update({
        data: {
          last_refreshed_at: new Date(fortyFiveDaysAgo.getTime() + 1 - index),
        },
        where: { id: fixture.authorisation.id },
      });
    }
    const result = await listDueXeroAuthorisations(maintenanceNow, tx);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const ids = result.value.map((grant) => grant.id);
    expect(ids).not.toContain(fixtures[0]?.authorisation.id);
    expect(ids).toContain(fixtures[1]?.authorisation.id);
    expect(ids).toContain(fixtures[2]?.authorisation.id);
  });
});

test("paused active connections in two accounts select their shared grant once", async () => {
  await rolledBack(async (tx) => {
    const first = await createXeroConnectionFixture(tx, ownedFixture);
    const second = await createXeroConnectionFixture(tx, ownedFixture, 1);
    await tx.xeroAuthorisation.update({
      data: { last_refreshed_at: fortyFiveDaysAgo },
      where: { id: first.authorisation.id },
    });
    await tx.xeroConnection.update({
      data: { sync_paused_at: maintenanceNow },
      where: { id: first.connection.id },
    });
    await tx.xeroConnection.update({
      data: {
        sync_paused_at: maintenanceNow,
        xero_authorisation_id: first.authorisation.id,
      },
      where: { id: second.connection.id },
    });
    const result = await listDueXeroAuthorisations(maintenanceNow, tx);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      result.value.filter((grant) => grant.id === first.authorisation.id)
    ).toEqual([
      {
        id: first.authorisation.id,
        last_refreshed_at: fortyFiveDaysAgo,
        provider_app_id: first.authorisation.provider_app_id,
        xero_user_id: first.authorisation.xero_user_id,
      },
    ]);
  });
});

test("maintenance excludes grants without a live active connection or with revoked access", async () => {
  await rolledBack(async (tx) => {
    const inactive = await createXeroConnectionFixture(tx, ownedFixture, 0);
    const archived = await createXeroConnectionFixture(tx, ownedFixture, 1);
    const disconnected = await createXeroConnectionFixture(tx, ownedFixture, 2);
    const disconnectedAt = await createXeroConnectionFixture(
      tx,
      ownedFixture,
      3
    );
    const reconnect = await createXeroConnectionFixture(tx, ownedFixture, 4);
    const revoked = await createXeroConnectionFixture(tx, ownedFixture, 5);
    const unlinked = await createXeroAuthorisationFixture(tx, ownedFixture, 6);
    const fixtureIds = [
      inactive,
      archived,
      disconnected,
      disconnectedAt,
      reconnect,
      revoked,
    ].map((fixture) => fixture.authorisation.id);
    fixtureIds.push(unlinked.id);
    await tx.xeroAuthorisation.updateMany({
      data: { last_refreshed_at: fortyFiveDaysAgo },
      where: { id: { in: fixtureIds } },
    });
    await tx.organisation.update({
      data: { is_active: false },
      where: { id: inactive.organisation.id },
    });
    await tx.organisation.update({
      data: { archived_at: maintenanceNow },
      where: { id: archived.organisation.id },
    });
    await tx.xeroConnection.update({
      data: { status: "disconnected" },
      where: { id: disconnected.connection.id },
    });
    await tx.xeroConnection.update({
      data: { disconnected_at: maintenanceNow },
      where: { id: disconnectedAt.connection.id },
    });
    await tx.xeroConnection.update({
      data: { status: "reconnect_required" },
      where: { id: reconnect.connection.id },
    });
    await tx.xeroAuthorisation.update({
      data: { status: "reconnect_required" },
      where: { id: revoked.authorisation.id },
    });
    const result = await listDueXeroAuthorisations(maintenanceNow, tx);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      result.value.filter((grant) => fixtureIds.includes(grant.id))
    ).toEqual([]);
  });
});
test("rejects duplicate canonical app and verified user", async () => {
  await rolledBack(async (tx) => {
    const { authorisation } = await createXeroConnectionFixture(
      tx,
      ownedFixture
    );
    const {
      id: _id,
      created_at: _created,
      updated_at: _updated,
      ...data
    } = authorisation;
    await expect(tx.xeroAuthorisation.create({ data })).rejects.toMatchObject({
      code: "P2002",
    });
  });
});
test("rejects a second connection for the same payroll organisation", async () => {
  await rolledBack(async (tx) => {
    const { connection } = await createXeroConnectionFixture(tx, ownedFixture);
    await expect(
      tx.xeroConnection.create({
        data: {
          account_id: connection.account_id,
          organisation_id: connection.organisation_id,
          payroll_region: "AU",
          xero_tenant_id: randomUUID(),
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
test("rejects a connection owned by another Account", async () => {
  await rolledBack(async (tx) => {
    const organisation = await tx.organisation.create({
      data: {
        account_id: primaryTenant.accountId,
        country_code: "AU",
        id: primaryTenant.organisationId,
        name: "Owned test payroll",
      },
    });
    await expect(
      tx.xeroConnection.create({
        data: {
          account_id: "foreign-account",
          organisation_id: organisation.id,
          payroll_region: "AU",
          xero_tenant_id: randomUUID(),
        },
      })
    ).rejects.toMatchObject({ code: "P2003" });
  });
});
test("rejects a cursor attached to another account", async () => {
  await rolledBack(async (tx) => {
    const { connection } = await createXeroConnectionFixture(tx, ownedFixture);
    await expect(
      tx.xeroSyncCursor.create({
        data: {
          account_id: "foreign-account",
          entity_type: "people",
          modified_since: new Date(),
          organisation_id: connection.organisation_id,
          xero_connection_id: connection.id,
        },
      })
    ).rejects.toMatchObject({ code: "P2003" });
  });
});
test("does not reveal sibling account metadata from real rows", async () => {
  await withCommittedConnection(async (connection) => {
    await withTenantDb(connection.account_id, async (tx) => {
      const owned = {
        accountId: connection.account_id,
        connectionId: connection.id,
        organisationId: connection.organisation_id,
      };
      expect((await getScopedXeroConnection(owned, tx)).ok).toBe(true);
      await expect(
        getScopedXeroConnection({ ...owned, accountId: "foreign-account" }, tx)
      ).rejects.toBeInstanceOf(TenantMismatchError);
      expect(
        (
          await getScopedXeroConnection(
            { ...owned, organisationId: randomUUID() },
            tx
          )
        ).ok
      ).toBe(false);
    });
  });
});
test("advances completed provider watermarks monotonically within both scope keys", async () => {
  await withCommittedConnection(async (connection) => {
    await withTenantDb(connection.account_id, async (tx) => {
      const scope = {
        accountId: connection.account_id,
        organisationId: connection.organisation_id,
      };
      const next = new Date("2026-10-07T00:00:00Z");
      const input = {
        connectionId: connection.id,
        entityType: "people" as const,
        expectedModifiedSince: null,
        nextModifiedSince: next,
        scope,
      };
      expect(await advanceXeroSyncCursor(input, tx)).toBe(true);
      expect(
        await advanceXeroSyncCursor(
          { ...input, nextModifiedSince: new Date(next.getTime() + 1000) },
          tx
        )
      ).toBe(false);
      expect(
        await advanceXeroSyncCursor(
          {
            ...input,
            expectedModifiedSince: next,
            nextModifiedSince: new Date(next.getTime() - 1000),
          },
          tx
        )
      ).toBe(false);
      const result = await tx.xeroSyncCursor.findFirstOrThrow({
        where: {
          account_id: scope.accountId,
          organisation_id: scope.organisationId,
          xero_connection_id: connection.id,
        },
      });
      expect(result.modified_since).toEqual(next);
    });
  });
});
test("preserves manual balance uniqueness", async () => {
  await rolledBack(async (tx) => {
    const { organisation } = await createXeroConnectionFixture(
      tx,
      ownedFixture
    );
    const person = await tx.person.create({
      data: {
        account_id: organisation.account_id,
        email: `${randomUUID()}@example.test`,
        employment_type: "employee",
        first_name: "Test",
        last_name: "Person",
        organisation_id: organisation.id,
        source_system: "MANUAL",
      },
    });
    const data = {
      account_id: organisation.account_id,
      balance: "5",
      leave_type_xero_id: "manual-annual",
      organisation_id: organisation.id,
      person_id: person.id,
      xero_connection_id: null,
    };
    await tx.leaveBalance.create({ data });
    await expect(tx.leaveBalance.create({ data })).rejects.toMatchObject({
      code: "P2002",
    });
  });
});

test("reauthorisation preserves the canonical grant ID and original creation timestamp", async () => {
  await rolledBack(async (tx) => {
    const { authorisation } = await createXeroConnectionFixture(
      tx,
      ownedFixture
    );
    const replacement = await saveXeroAuthorisation(
      {
        ...authorisation,
        access_token_encrypted: "new-encrypted-grant",
        created_at: new Date("2020-01-01"),
        id: randomUUID(),
      },
      tx
    );
    expect(replacement.id).toBe(authorisation.id);
    expect(replacement.created_at).toEqual(authorisation.created_at);
    expect(replacement.access_token_encrypted).toBe("new-encrypted-grant");
  });
});
test("cursor helper refuses wrong account and organisation keys without creating rows", async () => {
  await withCommittedConnection(async (connection) => {
    await withTenantDb(connection.account_id, async (tx) => {
      const input = {
        connectionId: connection.id,
        entityType: "people" as const,
        expectedModifiedSince: null,
        nextModifiedSince: new Date(),
      };
      await expect(
        advanceXeroSyncCursor(
          {
            ...input,
            scope: {
              accountId: "foreign",
              organisationId: connection.organisation_id,
            },
          },
          tx
        )
      ).rejects.toBeInstanceOf(TenantMismatchError);
      expect(
        await advanceXeroSyncCursor(
          {
            ...input,
            scope: {
              accountId: connection.account_id,
              organisationId: randomUUID(),
            },
          },
          tx
        )
      ).toBe(false);
      expect(
        await tx.xeroSyncCursor.count({
          where: {
            account_id: connection.account_id,
            organisation_id: connection.organisation_id,
            xero_connection_id: connection.id,
          },
        })
      ).toBe(0);
    });
  });
});
test("concurrent first watermark writes return one success without a unique-key error", async () => {
  const fixture = await database.$transaction((tx) =>
    createXeroConnectionFixture(tx, ownedFixture)
  );
  const scope = {
    accountId: fixture.connection.account_id,
    organisationId: fixture.connection.organisation_id,
  };
  try {
    const input = {
      connectionId: fixture.connection.id,
      entityType: "people" as const,
      expectedModifiedSince: null,
      nextModifiedSince: new Date(),
      scope,
    };
    const outcomes = await Promise.all([
      withTestTenantDb(scope.accountId, (db) =>
        advanceXeroSyncCursor(input, db)
      ),
      withTestTenantDb(scope.accountId, (db) =>
        advanceXeroSyncCursor(input, db)
      ),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
  } finally {
    await database.xeroSyncCursor.deleteMany({
      where: {
        account_id: scope.accountId,
        organisation_id: scope.organisationId,
        xero_connection_id: fixture.connection.id,
      },
    });
    await database.xeroConnection.deleteMany({
      where: {
        account_id: scope.accountId,
        id: fixture.connection.id,
        organisation_id: scope.organisationId,
      },
    });
    await database.organisation.deleteMany({
      where: { account_id: scope.accountId, id: scope.organisationId },
    });
    await database.xeroAuthorisation.delete({
      where: { id: fixture.authorisation.id },
    });
  }
});

async function withCommittedConnection(
  work: (
    connection: Awaited<
      ReturnType<typeof createXeroConnectionFixture>
    >["connection"]
  ) => Promise<void>
) {
  const fixture = await database.$transaction((tx) =>
    createXeroConnectionFixture(tx, ownedFixture)
  );
  try {
    await work(fixture.connection);
  } finally {
    await database.xeroSyncCursor.deleteMany({
      where: { xero_connection_id: fixture.connection.id },
    });
    await database.xeroConnection.delete({
      where: { id: fixture.connection.id },
    });
    await database.organisation.delete({
      where: { id: fixture.organisation.id },
    });
    await database.xeroAuthorisation.delete({
      where: { id: fixture.authorisation.id },
    });
  }
}
