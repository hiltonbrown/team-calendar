import { Pool } from "pg";
import { z } from "zod";
import {
  assertLiveDatabaseAuthority,
  LIVE_DATABASE_ACKNOWLEDGEMENT,
} from "../database-guard.js";
import { releaseEnvironment } from "./environment.js";

const recordId = z.string().uuid();

export async function findCreatedRecordId(input: {
  notes: string;
  personId: string;
}): Promise<string> {
  const { fixtures } = releaseEnvironment();
  if (input.personId !== fixtures.people.viewer) {
    throw new Error("Created-record lookup requires the controlled viewer");
  }
  const manifest = assertLiveDatabaseAuthority({
    acknowledgement: process.env.ALLOW_LIVE_DATABASE_TESTS,
    databaseUrl: process.env.DATABASE_URL,
    manifestPath: process.env.TC_RELEASE_MANIFEST,
    runId: process.env.TC_RELEASE_RUN_ID,
  });
  if (
    process.env.ALLOW_LIVE_DATABASE_TESTS !== LIVE_DATABASE_ACKNOWLEDGEMENT ||
    process.env.TC_RELEASE_DURABLE_VERIFIED !== manifest.runId ||
    process.env.TC_RELEASE_ACTIVE_RUN_VERIFIED !== manifest.runId
  ) {
    throw new Error("Created-record lookup requires the verified active run");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query<{ id: string }>(
      `SELECT ar.id
       FROM availability_records ar
       INNER JOIN organisations o ON o.id = ar.organisation_id
       WHERE ar.organisation_id = $1::uuid
         AND ar.person_id = $2::uuid
         AND ar.notes_internal = $3
         AND ar.archived_at IS NULL
         AND ar.clerk_org_id = o.clerk_org_id
       LIMIT 2`,
      [fixtures.organisations.primary, input.personId, input.notes]
    );
    if (result.rows.length !== 1) {
      throw new Error(
        `Expected one controlled record for the unique correlation, found ${result.rows.length}`
      );
    }
    return recordId.parse(result.rows[0]?.id);
  } finally {
    await pool.end();
  }
}
