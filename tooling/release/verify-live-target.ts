import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { Pool } from "pg";
import { acquireActiveRun, releaseActiveRun } from "./active-run-registry.js";
import {
  assertDurableManifestReadBack,
  assertLiveDatabaseAuthority,
} from "./database-guard.js";
import {
  assertAppliedMigrationChecksums,
  assertCandidateSha,
  assertSqlIdentity,
} from "./verify-live-target-logic.js";

const manifestFlag = process.argv.indexOf("--manifest");
const manifestPath =
  manifestFlag >= 0 ? process.argv[manifestFlag + 1] : undefined;
const manifest = assertLiveDatabaseAuthority({
  acknowledgement: process.env.ALLOW_LIVE_DATABASE_TESTS,
  databaseUrl: process.env.DATABASE_URL,
  manifestPath,
  runId: process.env.TC_RELEASE_RUN_ID,
});
await assertDurableManifestReadBack(manifest, {
  token: process.env.KV_REST_API_TOKEN,
  url: process.env.KV_REST_API_URL,
});
assertCandidateSha(
  manifest.candidateSha,
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
);
const activeRunState = await acquireActiveRun(manifest, {
  token: process.env.KV_REST_API_TOKEN,
  url: process.env.KV_REST_API_URL,
});
const recoveryRequested = process.argv.includes("--recover");
if (activeRunState === "interrupted" && !recoveryRequested) {
  throw new Error(
    "This manifest already owns an interrupted active run; pass --recover after checking its state"
  );
}
if (activeRunState === "acquired" && recoveryRequested) {
  await releaseActiveRun(manifest, {
    token: process.env.KV_REST_API_TOKEN,
    url: process.env.KV_REST_API_URL,
  });
  throw new Error("No interrupted release run exists for recovery");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  const identity = await client.query<{
    database: string;
    readOnly: string;
    role: string;
  }>(
    "SELECT current_database() AS database, current_user AS role, current_setting('transaction_read_only') AS \"readOnly\""
  );
  const [observed] = identity.rows;
  assertSqlIdentity(observed, manifest);

  const migrations = await client.query<{
    checksum: string;
    migration_name: string;
  }>(
    "SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"
  );
  const migrationRoot = resolve(
    import.meta.dirname,
    "../../packages/database/prisma/migrations"
  );
  assertAppliedMigrationChecksums(migrations.rows, migrationRoot);
  await client.query("ROLLBACK");
  console.log(
    JSON.stringify({
      appliedMigrations: migrations.rows.length,
      branchId: manifest.target.branchId,
      database: observed.database,
      endpointId: manifest.target.endpointId,
      projectId: manifest.target.projectId,
      readOnly: true,
      role: observed.role,
      status: "PASS",
    })
  );
} finally {
  client.release();
  await pool.end();
}
