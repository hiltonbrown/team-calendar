import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "prisma/migrations/20261025120000_better_auth_server/migration.sql"
  ),
  "utf8"
);

const destructiveSql =
  /\b(?:DROP|TRUNCATE|DELETE|UPDATE)\b(?! CASCADE| RESTRICT| SET NULL)/;
const tenantAuthGrant = /GRANT[\s\S]*team_calendar_app/i;
const unwantedAuthTables =
  /CREATE TABLE "(?:teams|team_members|organization_roles)"/;
const authTables = [
  "account_invitations",
  "account_members",
  "accounts",
  "auth_audit_events",
  "auth_identities",
  "auth_rate_limits",
  "auth_sessions",
  "auth_users",
  "auth_verifications",
];

describe("Better Auth server migration", () => {
  it("adds only the isolated auth storage, preserving Clerk-era domain data", () => {
    const created = Array.from(
      migration.matchAll(/CREATE TABLE "([a-z_]+)"/g),
      (match) => match[1]
    );
    expect(created.sort()).toEqual(authTables);
    expect(migration).not.toMatch(destructiveSql);
    for (const match of migration.matchAll(/ALTER TABLE "([a-z_]+)"/g)) {
      expect(authTables).toContain(match[1]);
    }
  });

  it("gives the tenant role no auth credentials, sessions or membership access", () => {
    expect(migration).not.toMatch(tenantAuthGrant);
    expect(migration).not.toContain("jwks");
    expect(migration).not.toMatch(unwantedAuthTables);
  });

  it("enforces the four roles and independent provider identities in Postgres", () => {
    expect(migration).toContain(
      "CREATE TYPE \"auth_member_role\" AS ENUM ('owner', 'admin', 'manager', 'viewer')"
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "auth_identities_provider_id_provider_subject_key" ON "auth_identities"("provider_id", "provider_subject")'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "account_members_account_id_user_id_key" ON "account_members"("account_id", "user_id")'
    );
  });
});
