import { afterAll, expect, test } from "vitest";
import {
  advanceXeroSyncCursor,
  completeXeroInitialSync,
} from "./src/queries/xero-sync-cursors";
import { TenantMismatchError, withTenantDb } from "./src/tenant-db";
import {
  createXeroConnectionFixture,
  xeroSimplificationFixture,
} from "./src/test-fixtures/xero-simplification-fixture";

const { database, fixture: ownedFixture } = xeroSimplificationFixture(
  "packages/database/xero-sync-cursors.integration.test.ts"
);
afterAll(() => database.$disconnect());
test("provider cursor commits are scoped, conditional and monotonic; old reconnect requests cannot complete", async () => {
  const owned = await database.$transaction((tx) =>
    createXeroConnectionFixture(tx, ownedFixture)
  );
  const { connection } = owned;
  const scope = {
    accountId: connection.account_id,
    organisationId: connection.organisation_id,
  };
  try {
    await withTenantDb(scope.accountId, async (tx) => {
      const first = new Date("2026-10-07T12:00:00Z");
      const next = new Date("2026-10-07T12:01:00Z");
      const cursor = {
        connectionId: connection.id,
        entityType: "people" as const,
        expectedModifiedSince: null,
        nextModifiedSince: first,
        scope,
      };
      await expect(
        advanceXeroSyncCursor(
          { ...cursor, scope: { ...scope, accountId: "foreign" } },
          tx
        )
      ).rejects.toBeInstanceOf(TenantMismatchError);
      expect(await advanceXeroSyncCursor(cursor, tx)).toBe(true);
      expect(
        await advanceXeroSyncCursor({ ...cursor, nextModifiedSince: next }, tx)
      ).toBe(false);
      expect(
        await advanceXeroSyncCursor(
          { ...cursor, expectedModifiedSince: first, nextModifiedSince: next },
          tx
        )
      ).toBe(true);
      expect(
        await advanceXeroSyncCursor(
          { ...cursor, expectedModifiedSince: next },
          tx
        )
      ).toBe(false);
      const current = await tx.xeroSyncCursor.findFirst({
        where: {
          account_id: scope.accountId,
          organisation_id: scope.organisationId,
          xero_connection_id: connection.id,
        },
      });
      expect(current?.modified_since).toEqual(next);
      await tx.xeroConnection.update({
        data: {
          balance_next_person_id: null,
          balance_sweep_failed: false,
          initial_sync_requested_at: next,
        },
        where: { id: connection.id },
      });
      expect(
        await completeXeroInitialSync(
          {
            ...scope,
            connectionId: connection.id,
            requestedAt: first.toISOString(),
          },
          tx
        )
      ).toBeNull();
      const completed = await completeXeroInitialSync(
        {
          ...scope,
          connectionId: connection.id,
          requestedAt: next.toISOString(),
        },
        tx
      );
      expect(completed).toBeInstanceOf(Date);
      expect(
        await completeXeroInitialSync(
          {
            ...scope,
            connectionId: connection.id,
            requestedAt: next.toISOString(),
          },
          tx
        )
      ).toEqual(completed);
    });
  } finally {
    await database.xeroSyncCursor.deleteMany({
      where: { xero_connection_id: connection.id },
    });
    await database.xeroConnection.delete({ where: { id: connection.id } });
    await database.organisation.delete({
      where: { id: owned.organisation.id },
    });
    await database.xeroAuthorisation.delete({
      where: { id: owned.authorisation.id },
    });
  }
});
