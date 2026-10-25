import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRestrictedDatabaseRole } from "./src/runtime-role";
import {
  closeDevelopmentSeedTenantClient,
  seedAuthDevelopmentFixtures,
} from "./src/seed/auth-fixtures";
import { createStandaloneDatabaseClient } from "./src/standalone-client";

const here = fileURLToPath(new URL(".", import.meta.url));
try {
  process.loadEnvFile(path.join(here, ".env"));
} catch {
  /* Explicit environment configuration also works. */
}

function configuration() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development seed cannot run in production");
  }
  const owner = process.env.DATABASE_URL;
  const tenant = process.env.DATABASE_APP_URL;
  const password = process.env.SEED_AUTH_PASSWORD;
  if (!(owner && tenant && password)) {
    throw new Error(
      "DATABASE_URL, DATABASE_APP_URL and SEED_AUTH_PASSWORD are required"
    );
  }
  const ownerUrl = new URL(owner),
    tenantUrl = new URL(tenant);
  const host = (value: URL) => value.hostname.replace("-pooler.", ".");
  if (
    host(ownerUrl) !== host(tenantUrl) ||
    ownerUrl.pathname !== tenantUrl.pathname ||
    (ownerUrl.port || "5432") !== (tenantUrl.port || "5432") ||
    ownerUrl.username === tenantUrl.username
  ) {
    throw new Error(
      "Seed owner and restricted tenant URLs must target the same database with distinct roles"
    );
  }
  return { owner, password, tenant };
}

let owner: ReturnType<typeof createStandaloneDatabaseClient> | undefined;
try {
  const config = configuration();
  await assertRestrictedDatabaseRole(config.tenant);
  owner = createStandaloneDatabaseClient(config.owner);
  const summary = await seedAuthDevelopmentFixtures(owner, config.password);
  process.stdout.write(
    `Seeded ${summary.accounts.length} Better Auth Accounts (AU, NZ, UK), ${summary.people} verified role users/People, ${summary.organisations} payroll Organisations and ${summary.teams} teams.\n`
  );
  for (const account of summary.accounts) {
    process.stdout.write(
      `${account.country}: ${account.accountId}; ${account.users.map((user) => user.email).join(", ")}\n`
    );
  }
} catch {
  process.stderr.write(
    "Development seed failed. Check fixture ownership, SEED_AUTH_PASSWORD (12 to 128 characters), and owner/restricted connections to the same development database. No credentials were printed.\n"
  );
  process.exitCode = 1;
} finally {
  if (owner) {
    await owner.$disconnect();
    await closeDevelopmentSeedTenantClient();
  }
}
