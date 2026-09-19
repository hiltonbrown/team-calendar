import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReleaseManifest } from "./database-guard.js";

export interface AppliedMigration {
  checksum: string;
  migration_name: string;
}

export const assertCandidateSha = (
  expectedCandidateSha: string,
  checkedOutSha: string
): void => {
  if (!checkedOutSha.startsWith(expectedCandidateSha)) {
    throw new Error(
      "Checked-out commit does not match the protected candidate"
    );
  }
};

export const assertSqlIdentity = (
  observed: { database: string; readOnly: string; role: string } | undefined,
  manifest: ReleaseManifest
): void => {
  if (
    !observed ||
    observed.database !== manifest.target.database ||
    observed.role !== manifest.target.role ||
    observed.readOnly !== "on"
  ) {
    throw new Error(
      "Read-only SQL identity does not match the protected target"
    );
  }
};

export const assertAppliedMigrationChecksums = (
  appliedMigrations: AppliedMigration[],
  migrationRoot: string
): void => {
  const repository = new Map<string, string>();
  for (const directory of readdirSync(migrationRoot, { withFileTypes: true })) {
    if (!directory.isDirectory()) {
      continue;
    }
    const sql = readFileSync(
      resolve(migrationRoot, directory.name, "migration.sql")
    );
    repository.set(
      directory.name,
      createHash("sha256").update(sql).digest("hex")
    );
  }

  for (const applied of appliedMigrations) {
    const expected = repository.get(applied.migration_name);
    if (!expected) {
      throw new Error(
        `Applied migration is absent from candidate: ${applied.migration_name}`
      );
    }
    if (applied.checksum !== expected) {
      throw new Error(
        `Applied migration checksum mismatch: ${applied.migration_name}`
      );
    }
  }
};
