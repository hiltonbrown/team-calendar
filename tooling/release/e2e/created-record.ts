import { Pool } from "pg";
import { z } from "zod";
import {
  assertLiveDatabaseAuthority,
  LIVE_DATABASE_ACKNOWLEDGEMENT,
} from "../database-guard.js";
import { releaseEnvironment } from "./environment.js";

const recordId = z.string().uuid();

export interface ReleaseFixtureIdentity {
  primaryClerkOrgId: string;
  viewerClerkUserId: string;
}

export async function validateReleaseFixtureOwnership(): Promise<ReleaseFixtureIdentity> {
  const { fixtures, manifest } = releaseEnvironment();
  const pool = guardedPool();
  try {
    const organisations = await pool.query<{
      clerk_org_id: string;
      id: string;
    }>(
      `SELECT id, clerk_org_id
       FROM organisations
       WHERE id = ANY($1::uuid[])`,
      [[fixtures.organisations.primary, fixtures.organisations.foreign]]
    );
    if (organisations.rows.length !== 2) {
      throw new Error("Release fixture organisations are incomplete");
    }
    const clerkOrgByOrganisation = new Map(
      organisations.rows.map((row) => [row.id, row.clerk_org_id])
    );
    for (const clerkOrgId of clerkOrgByOrganisation.values()) {
      if (!manifest.owned.clerkOrgIds.includes(clerkOrgId)) {
        throw new Error("Release fixture organisation is not manifest-owned");
      }
    }
    const expectedPeople = new Map([
      [fixtures.people.approve, fixtures.organisations.primary],
      [fixtures.people.decline, fixtures.organisations.primary],
      [fixtures.people.foreign, fixtures.organisations.foreign],
      [fixtures.people.recovery, fixtures.organisations.primary],
      [fixtures.people.retry, fixtures.organisations.primary],
      [fixtures.people.viewer, fixtures.organisations.primary],
    ]);
    const people = await pool.query<{
      clerk_user_id: string | null;
      id: string;
      organisation_id: string;
    }>(
      `SELECT id, organisation_id, clerk_user_id
       FROM people
       WHERE id = ANY($1::uuid[])`,
      [[...expectedPeople.keys()]]
    );
    if (people.rows.length !== expectedPeople.size) {
      throw new Error("Release fixture people are incomplete");
    }
    for (const person of people.rows) {
      if (person.organisation_id !== expectedPeople.get(person.id)) {
        throw new Error(
          "Release fixture person belongs to the wrong organisation"
        );
      }
    }
    const viewer = people.rows.find(
      (person) => person.id === fixtures.people.viewer
    );
    if (!viewer?.clerk_user_id) {
      throw new Error("Controlled viewer is not mapped to a Clerk user");
    }
    const expectedRecords = new Map([
      [fixtures.records.approve, fixtures.people.approve],
      [fixtures.records.decline, fixtures.people.decline],
      [fixtures.records.recovery, fixtures.people.recovery],
      [fixtures.records.retry, fixtures.people.retry],
    ]);
    const records = await pool.query<{
      id: string;
      organisation_id: string;
      person_id: string;
    }>(
      `SELECT id, organisation_id, person_id
       FROM availability_records
       WHERE id = ANY($1::uuid[])`,
      [[...expectedRecords.keys()]]
    );
    if (records.rows.length !== expectedRecords.size) {
      throw new Error("Release fixture records are incomplete");
    }
    for (const record of records.rows) {
      if (
        record.organisation_id !== fixtures.organisations.primary ||
        record.person_id !== expectedRecords.get(record.id)
      ) {
        throw new Error("Release fixture record has unexpected ownership");
      }
    }
    const feed = await pool.query<{ organisation_id: string }>(
      "SELECT organisation_id FROM feeds WHERE id = $1::uuid",
      [fixtures.feeds.primary]
    );
    if (
      feed.rows.length !== 1 ||
      feed.rows[0]?.organisation_id !== fixtures.organisations.primary
    ) {
      throw new Error("Release fixture feed has unexpected ownership");
    }
    const primaryClerkOrgId = clerkOrgByOrganisation.get(
      fixtures.organisations.primary
    );
    if (!primaryClerkOrgId) {
      throw new Error("Primary release organisation is unavailable");
    }
    return { primaryClerkOrgId, viewerClerkUserId: viewer.clerk_user_id };
  } finally {
    await pool.end();
  }
}

export async function findCreatedRecordId(input: {
  notes: string;
  personId: string;
}): Promise<string> {
  const { fixtures } = releaseEnvironment();
  if (input.personId !== fixtures.people.viewer) {
    throw new Error("Created-record lookup requires the controlled viewer");
  }
  const pool = guardedPool();
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

function guardedPool(): Pool {
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
  return new Pool({ connectionString: process.env.DATABASE_URL });
}
