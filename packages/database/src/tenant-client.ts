import "server-only";
import { keys } from "../keys";
import { createLazyClient } from "./lazy-client";
import { assertTestDatabaseConnectionAllowed } from "./live-test-guard";
import { createStandaloneDatabaseClient } from "./standalone-client";

export const referenceDatabase = createLazyClient({
  create: () => {
    const connectionString = keys().DATABASE_APP_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_APP_URL is required for tenant database access"
      );
    }
    return createStandaloneDatabaseClient(connectionString);
  },
  guard: () =>
    assertTestDatabaseConnectionAllowed(process.env.DATABASE_APP_URL),
});
