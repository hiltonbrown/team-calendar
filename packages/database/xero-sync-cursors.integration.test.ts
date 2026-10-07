import { afterAll, expect, test } from "vitest";
import {
  advanceXeroSyncCursor,
  completeXeroInitialSync,
} from "./src/queries/xero-sync-cursors";
import {
  createXeroConnectionFixture,
  xeroSimplificationFixture,
} from "./src/test-fixtures/xero-simplification-fixture";

const { database } = xeroSimplificationFixture();
afterAll(() => database.$disconnect());
test("provider cursor commits are scoped, conditional and monotonic; old reconnect requests cannot complete", async () => {
  await database
    .$transaction(async (tx) => {
      const { connection } = await createXeroConnectionFixture(tx);
      const scope = {
        clerkOrgId: connection.clerk_org_id,
        organisationId: connection.organisation_id,
      };
      const first = new Date("2026-10-07T12:00:00Z");
      const next = new Date("2026-10-07T12:01:00Z");
      const cursor = {
        connectionId: connection.id,
        entityType: "people" as const,
        expectedModifiedSince: null,
        nextModifiedSince: first,
        scope,
      };
      expect(
        await advanceXeroSyncCursor(
          { ...cursor, scope: { ...scope, clerkOrgId: "foreign" } },
          tx
        )
      ).toBe(false);
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
          clerk_org_id: scope.clerkOrgId,
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
      throw new Error("owned fixture rollback");
    })
    .catch((error: unknown) => {
      if (
        !(error instanceof Error) ||
        error.message !== "owned fixture rollback"
      ) {
        throw error;
      }
    });
});
