import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ReleaseManifest } from "./database-guard.js";
import {
  assertAppliedMigrationChecksums,
  assertCandidateSha,
  assertSqlIdentity,
} from "./verify-live-target-logic.js";

const manifest = {
  target: { database: "teamcalendar", role: "release_role" },
} as ReleaseManifest;

const migrationFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "tc-migrations-"));
  const directory = join(root, "20260919000000_baseline");
  mkdirSync(directory);
  const sql = Buffer.from("SELECT 1;\n");
  writeFileSync(join(directory, "migration.sql"), sql);
  return {
    checksum: createHash("sha256").update(sql).digest("hex"),
    name: "20260919000000_baseline",
    root,
  };
};

describe("live target SQL verification", () => {
  it("binds verification to the protected candidate commit", () => {
    expect(() =>
      assertCandidateSha("80ac9f7", "80ac9f7123456789012345678901234567890123")
    ).not.toThrow();
    expect(() =>
      assertCandidateSha("80ac9f7", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    ).toThrow("protected candidate");
  });

  it("accepts only the protected identity inside a read-only transaction", () => {
    expect(() =>
      assertSqlIdentity(
        { database: "teamcalendar", readOnly: "on", role: "release_role" },
        manifest
      )
    ).not.toThrow();
    expect(() =>
      assertSqlIdentity(
        { database: "teamcalendar", readOnly: "off", role: "release_role" },
        manifest
      )
    ).toThrow("protected target");
  });

  it("matches every applied migration to candidate bytes", () => {
    const fixture = migrationFixture();
    expect(() =>
      assertAppliedMigrationChecksums(
        [{ checksum: fixture.checksum, migration_name: fixture.name }],
        fixture.root
      )
    ).not.toThrow();
  });

  it("rejects drift and applied migrations absent from the candidate", () => {
    const fixture = migrationFixture();
    expect(() =>
      assertAppliedMigrationChecksums(
        [{ checksum: "changed", migration_name: fixture.name }],
        fixture.root
      )
    ).toThrow("checksum mismatch");
    expect(() =>
      assertAppliedMigrationChecksums(
        [{ checksum: fixture.checksum, migration_name: "unknown" }],
        fixture.root
      )
    ).toThrow("absent from candidate");
  });
});
