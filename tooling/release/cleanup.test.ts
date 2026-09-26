import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("inactivity report fixture cleanup registration", () => {
  it("uses the same scoped child-table inventory for counting, deletion and residue read-back", () => {
    const source = readFileSync(
      new URL("./cleanup.ts", import.meta.url),
      "utf8"
    );
    const inventory = source.slice(
      source.indexOf("const scopedTables = ["),
      source.indexOf("] as const;")
    );
    expect(
      inventory.indexOf('"xero_inactivity_classifications"')
    ).toBeGreaterThan(-1);
    expect(inventory.indexOf('"xero_inactivity_classifications"')).toBeLessThan(
      inventory.indexOf('"xero_tenants"')
    );
    expect(source.split("for (const table of scopedTables)")).toHaveLength(4);
    expect(source).toContain("AND organisation_id IN");
    expect(source).toContain("assertActiveRunOwner(manifest");
    expect(source).toContain("assertConsumerIsolationReadBack(manifest");
  });
});
