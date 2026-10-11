import { isLocalDatabase } from "../src/is-local-database";
import { createStandaloneDatabaseClient } from "../src/standalone-client";

const ownerUrl = process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_APP_URL;
if (
  !(ownerUrl && appUrl && isLocalDatabase(ownerUrl) && isLocalDatabase(appUrl))
) {
  throw new Error(
    "Local restricted-role provisioning requires local owner and app URLs"
  );
}
const identity = new URL(appUrl);
if (decodeURIComponent(identity.username) !== "team_calendar_app") {
  throw new Error("DATABASE_APP_URL must use team_calendar_app");
}
const client = createStandaloneDatabaseClient(ownerUrl);
try {
  // ALTER ROLE cannot parameterise its password clause. Quote only the parsed
  // local test password; never log the URL or SQL.
  const password = decodeURIComponent(identity.password).replaceAll("'", "''");
  await client.$executeRawUnsafe(
    `ALTER ROLE team_calendar_app LOGIN PASSWORD '${password}'`
  );
} finally {
  await client.$disconnect();
}
