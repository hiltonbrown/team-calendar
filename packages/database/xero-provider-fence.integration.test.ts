import { afterAll, expect, test, vi } from "vitest";
import type { Prisma } from "./generated/client";
import { markScopedXeroConnectionReconnectRequired } from "./src/queries/xero-connections";
import { systemDatabase } from "./src/system-client";
import {
  createXeroConnectionFixture,
  xeroSimplificationFixture,
} from "./src/test-fixtures/xero-simplification-fixture";

const { database } = xeroSimplificationFixture();
afterAll(() => database.$disconnect());

test("a grant rotated after scoped resolution refuses the stale provider disconnect", async () => {
  const fixture = await database.$transaction(createXeroConnectionFixture);
  const update = systemDatabase.xeroConnection.updateMany.bind(
    systemDatabase.xeroConnection
  );
  const rotatedAt = new Date(fixture.authorisation.updated_at.getTime() + 1000);
  const mutation = vi
    .spyOn(systemDatabase.xeroConnection, "updateMany")
    .mockImplementationOnce((args) => {
      const result = (async () => {
        await database.xeroAuthorisation.update({
          data: { updated_at: rotatedAt },
          where: { id: fixture.authorisation.id },
        });
        return update(args);
      })();
      // The interceptor awaits a real rotation before dispatching Prisma SQL.
      // Preserve the delegate promise tag expected by Prisma's static interface.
      return Object.defineProperty(result, Symbol.toStringTag, {
        value: "PrismaPromise",
      }) as Prisma.PrismaPromise<Prisma.BatchPayload>;
    });
  try {
    const changed = await markScopedXeroConnectionReconnectRequired({
      authorisationId: fixture.authorisation.id,
      authorisationUpdatedAt: fixture.authorisation.updated_at,
      clerkOrgId: fixture.connection.clerk_org_id,
      connectionId: fixture.connection.id,
      lastConnectedAt: fixture.connection.last_connected_at,
      organisationId: fixture.connection.organisation_id,
      remoteConnectionId: fixture.connection.remote_connection_id ?? "",
      xeroTenantId: fixture.connection.xero_tenant_id,
    });
    expect(changed).toBe(false);
    expect(
      (
        await database.xeroConnection.findUnique({
          where: { id: fixture.connection.id },
        })
      )?.status
    ).toBe("active");
    expect(mutation).toHaveBeenCalledOnce();
  } finally {
    mutation.mockRestore();
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
});
