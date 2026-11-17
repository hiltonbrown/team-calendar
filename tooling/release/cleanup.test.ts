import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cleanupSource = () =>
  readFileSync(new URL("./cleanup.ts", import.meta.url), "utf8");
const inventoryFrom = (source: string, name: string): string[] => {
  const section = source.split(`const ${name} = [`)[1]?.split("] as const;")[0];
  if (!section) {
    throw new Error(`Cleanup inventory ${name} is missing`);
  }
  return [...section.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
};
const MODEL_PATTERN = /^model\s+(\w+)\s*\{([\s\S]+?)^\}/gm;
const REQUIRED_ACCOUNT_PATTERN = /^\s+account_id\s+String(?!\?)(?:\s|$)/m;
const COMPANY_PATTERN = /^\s+organisation_id\s+String/m;
const TABLE_PATTERN = /@@map\("([^"]+)"\)/;
const schemaModels = () => {
  const schema = readFileSync(
    new URL("../../packages/database/prisma/schema.prisma", import.meta.url),
    "utf8"
  );
  return [...schema.matchAll(MODEL_PATTERN)].map((match) => ({
    body: match[2],
    modelName: match[1],
    table: match[2].match(TABLE_PATTERN)?.[1],
  }));
};

describe("scoped fixture cleanup registration", () => {
  it("covers every required-account domain table without obsolete table names", () => {
    const source = cleanupSource();
    const registered = [
      ...inventoryFrom(source, "scopedTables"),
      ...inventoryFrom(source, "accountTables"),
      "organisations",
    ];
    const expected = schemaModels()
      // Auth/control UUIDs have separate ownership. Clerk-era domain fixture
      // IDs cannot authorise deleting auth identities or memberships.
      .filter(({ modelName }) => !modelName.startsWith("Auth"))
      .filter(({ body }) => REQUIRED_ACCOUNT_PATTERN.test(body))
      .map(({ table }) => table);
    expect([...registered].sort()).toEqual(expected.sort());
    expect(new Set(registered).size).toBe(registered.length);
    for (const table of inventoryFrom(source, "scopedTables")) {
      expect(
        schemaModels().find((model) => model.table === table)?.body,
        table
      ).toMatch(COMPANY_PATTERN);
    }
  });

  it("includes account-wide fixtures while retaining account and company ownership", () => {
    const source = cleanupSource();
    expect(source).toContain("const scopedSql = `account_id IN (");
    expect(source).toContain(
      "manifest.owned.accountIds.length)}) AND (organisation_id IS NULL OR organisation_id IN"
    );
    expect(source).toContain("account_id: { in: manifest.owned.accountIds }");
    expect(source).toContain("{ organisation_id: null }");
    expect(source).toContain(
      "{ organisation_id: { in: manifest.owned.organisationIds } }"
    );
  });

  it("uses the same scoped child-table inventory for counting, deletion and residue read-back", () => {
    const source = readFileSync(
      new URL("./cleanup.ts", import.meta.url),
      "utf8"
    );
    const inventory = source.slice(
      source.indexOf("const scopedTables = ["),
      source.indexOf("] as const;")
    );
    expect(inventory.indexOf('"xero_sync_cursors"')).toBeGreaterThan(-1);
    expect(inventory.indexOf('"xero_connections"')).toBeGreaterThan(
      inventory.indexOf('"xero_sync_cursors"')
    );
    expect(inventory.indexOf('"feed_event_publications"')).toBeGreaterThan(-1);
    expect(inventory.indexOf('"feed_event_publications"')).toBeLessThan(
      inventory.indexOf('"feeds"')
    );
    expect(source.split("for (const table of scopedTables)")).toHaveLength(4);
    expect(source).toContain(
      "AND (organisation_id IS NULL OR organisation_id IN"
    );
    expect(source).toContain("assertActiveRunOwner(manifest");
    expect(source).toContain("assertConsumerIsolationReadBack(manifest");
  });
});
