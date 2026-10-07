import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import type { Prisma } from "./generated/client";
import { saveXeroAuthorisation } from "./src/queries/xero-authorisation";
import { getScopedXeroConnection } from "./src/queries/xero-connections";
import { advanceXeroSyncCursor } from "./src/queries/xero-sync-cursors";
import {
  createXeroConnectionFixture,
  xeroSimplificationFixture,
} from "./src/test-fixtures/xero-simplification-fixture";

const { database } = xeroSimplificationFixture();
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
test("rejects duplicate canonical app and verified user", async () => {
  await rolledBack(async (tx) => {
    const { authorisation } = await createXeroConnectionFixture(tx);
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
    const { connection } = await createXeroConnectionFixture(tx);
    await expect(
      tx.xeroConnection.create({
        data: {
          clerk_org_id: connection.clerk_org_id,
          organisation_id: connection.organisation_id,
          payroll_region: "AU",
          xero_tenant_id: randomUUID(),
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
test("rejects a connection owned by another Clerk account", async () => {
  await rolledBack(async (tx) => {
    const organisation = await tx.organisation.create({
      data: {
        clerk_org_id: randomUUID(),
        country_code: "AU",
        name: "Owned test payroll",
      },
    });
    await expect(
      tx.xeroConnection.create({
        data: {
          clerk_org_id: "foreign-account",
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
    const { connection } = await createXeroConnectionFixture(tx);
    await expect(
      tx.xeroSyncCursor.create({
        data: {
          clerk_org_id: "foreign-account",
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
  await rolledBack(async (tx) => {
    const { connection } = await createXeroConnectionFixture(tx);
    const owned = {
      clerkOrgId: connection.clerk_org_id,
      connectionId: connection.id,
      organisationId: connection.organisation_id,
    };
    expect((await getScopedXeroConnection(owned, tx)).ok).toBe(true);
    expect(
      (
        await getScopedXeroConnection(
          { ...owned, clerkOrgId: "foreign-account" },
          tx
        )
      ).ok
    ).toBe(false);
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
test("advances completed provider watermarks monotonically within both scope keys", async () => {
  await rolledBack(async (tx) => {
    const { connection } = await createXeroConnectionFixture(tx);
    const scope = {
      clerkOrgId: connection.clerk_org_id,
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
        clerk_org_id: scope.clerkOrgId,
        organisation_id: scope.organisationId,
        xero_connection_id: connection.id,
      },
    });
    expect(result.modified_since).toEqual(next);
  });
});
test("preserves manual balance uniqueness", async () => {
  await rolledBack(async (tx) => {
    const { organisation } = await createXeroConnectionFixture(tx);
    const person = await tx.person.create({
      data: {
        clerk_org_id: organisation.clerk_org_id,
        email: `${randomUUID()}@example.test`,
        employment_type: "employee",
        first_name: "Test",
        last_name: "Person",
        organisation_id: organisation.id,
        source_system: "MANUAL",
      },
    });
    const data = {
      balance: "5",
      clerk_org_id: organisation.clerk_org_id,
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
    const { authorisation } = await createXeroConnectionFixture(tx);
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
test("cursor helper refuses wrong Clerk and organisation keys without creating rows", async () => {
  await rolledBack(async (tx) => {
    const { connection } = await createXeroConnectionFixture(tx);
    const input = {
      connectionId: connection.id,
      entityType: "people" as const,
      expectedModifiedSince: null,
      nextModifiedSince: new Date(),
    };
    expect(
      await advanceXeroSyncCursor(
        {
          ...input,
          scope: {
            clerkOrgId: "foreign",
            organisationId: connection.organisation_id,
          },
        },
        tx
      )
    ).toBe(false);
    expect(
      await advanceXeroSyncCursor(
        {
          ...input,
          scope: {
            clerkOrgId: connection.clerk_org_id,
            organisationId: randomUUID(),
          },
        },
        tx
      )
    ).toBe(false);
    expect(
      await tx.xeroSyncCursor.count({
        where: {
          clerk_org_id: connection.clerk_org_id,
          organisation_id: connection.organisation_id,
          xero_connection_id: connection.id,
        },
      })
    ).toBe(0);
  });
});
test("concurrent first watermark writes return one success without a unique-key error", async () => {
  const fixture = await database.$transaction((tx) =>
    createXeroConnectionFixture(tx)
  );
  const scope = {
    clerkOrgId: fixture.connection.clerk_org_id,
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
      advanceXeroSyncCursor(input),
      advanceXeroSyncCursor(input),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
  } finally {
    await database.xeroSyncCursor.deleteMany({
      where: {
        clerk_org_id: scope.clerkOrgId,
        organisation_id: scope.organisationId,
        xero_connection_id: fixture.connection.id,
      },
    });
    await database.xeroConnection.deleteMany({
      where: {
        clerk_org_id: scope.clerkOrgId,
        id: fixture.connection.id,
        organisation_id: scope.organisationId,
      },
    });
    await database.organisation.deleteMany({
      where: { clerk_org_id: scope.clerkOrgId, id: scope.organisationId },
    });
    await database.xeroAuthorisation.delete({
      where: { id: fixture.authorisation.id },
    });
  }
});
