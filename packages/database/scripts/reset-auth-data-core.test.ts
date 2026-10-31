import { describe, expect, it, vi } from "vitest";
import {
  deletionOrder,
  parseResetOptions,
  type ResetConnection,
  resetAuthData,
} from "./reset-auth-data-core";

const countSqlPattern = /FROM "public"\."([^"]+)" t$/;
const deleteSqlPattern = /DELETE FROM "public"\."([^"]+)"/;
const mutationPattern = /^(DELETE|CREATE|LOCK)/;
const identity = {
  branch_id: "br-fixture-123",
  database: "fixture",
  endpoint_id: "ep-fixture-123",
  project_id: "fixture-project-123",
  role: "neondb_owner",
};
const branch = {
  default: false,
  id: identity.branch_id,
  name: "auth-rehearsal",
  primary: false,
  project_id: identity.project_id,
  protected: false,
};
const table = (name: string, accountText = true) => ({
  account_text: accountText,
  id_key: true,
  name,
  partitioned: false,
  rls_active: false,
  schema: "public",
});
const fk = (child: string, parent: string, column = "organisation_id") => ({
  child_columns: [column],
  child_name: child,
  child_schema: "public",
  name: `${child}_${column}_fkey`,
  parent_columns: ["id"],
  parent_name: parent,
  parent_schema: "public",
});
const rows = () =>
  new Map([
    ["organisations", { selected: 2, total: 3 }],
    ["people", { selected: 4, total: 5 }],
    ["xero_connections", { selected: 2, total: 3 }],
    ["xero_oauth_sessions", { selected: 1, total: 1 }],
    ["xero_authorisations", { selected: 1, total: 3 }],
    ["plans", { selected: 0, total: 3 }],
    ["auth_users", { selected: 0, total: 4 }],
  ]);
function fixture(
  overrides: {
    blocked?: boolean;
    deleteMismatch?: boolean;
    changedCatalogue?: boolean;
    unsafeRls?: boolean;
    nullableReferenceTo?: "organisations" | "xero_authorisations";
  } = {}
) {
  const calls: string[] = [];
  let data = rows();
  let saved = rows();
  let catalogueCalls = 0;
  const tables = [
    table("organisations"),
    table("people"),
    table("xero_connections"),
    table("xero_oauth_sessions"),
    table("xero_authorisations", false),
    table("plans", false),
    table("auth_users", false),
  ];
  const foreignKeys = [
    fk("people", "organisations"),
    fk("people", "people", "manager_person_id"),
    {
      ...fk("xero_connections", "organisations"),
      child_columns: ["organisation_id", "account_id"],
      parent_columns: ["id", "account_id"],
    },
    fk("xero_oauth_sessions", "organisations"),
    fk("xero_connections", "xero_authorisations", "xero_authorisation_id"),
    fk("xero_oauth_sessions", "xero_authorisations", "xero_authorisation_id"),
  ];
  if (overrides.nullableReferenceTo) {
    tables.push(table("stripe_events"));
    data.set("stripe_events", { selected: 0, total: 1 });
    foreignKeys.push(
      fk("stripe_events", overrides.nullableReferenceTo, "legacy_reference_id")
    );
    if (overrides.nullableReferenceTo === "xero_authorisations") {
      data.set("xero_authorisations", { selected: 0, total: 3 });
    }
  }
  const db: ResetConnection = {
    query: async (sql) => {
      await Promise.resolve();
      calls.push(sql);
      if (sql.startsWith("SELECT current_database")) {
        return { rows: [identity] };
      }
      if (sql.includes("AS account_text")) {
        catalogueCalls += 1;
        return {
          rows: tables.map((entry) => ({
            ...entry,
            ...(overrides.unsafeRls && entry.name === "people"
              ? { rls_active: true }
              : {}),
            ...(overrides.changedCatalogue &&
            catalogueCalls > 1 &&
            entry.name === "people"
              ? { id_key: false }
              : {}),
          })),
        };
      }
      if (sql.includes("AS child_columns")) {
        return { rows: foreignKeys };
      }
      if (sql.startsWith("BEGIN")) {
        saved = new Map([...data].map(([name, value]) => [name, { ...value }]));
        return { rows: [] };
      }
      if (sql === "ROLLBACK") {
        data = saved;
        return { rows: [] };
      }
      if (sql.includes(" AS blocked")) {
        return {
          rows: [
            {
              blocked:
                overrides.blocked ??
                (overrides.nullableReferenceTo === "organisations" &&
                  sql.includes('"stripe_events" child')),
            },
          ],
        };
      }
      if (sql.startsWith("SELECT count(*)")) {
        const name = sql.match(countSqlPattern)?.[1];
        const value = name ? data.get(name) : undefined;
        if (!value) {
          throw new Error("Unexpected count query");
        }
        return {
          rows: [
            { selected: String(value.selected), total: String(value.total) },
          ],
        };
      }
      if (sql.startsWith("DELETE FROM")) {
        const name = sql.match(deleteSqlPattern)?.[1];
        const value = name ? data.get(name) : undefined;
        if (!value) {
          throw new Error("Unexpected delete query");
        }
        const count = value.selected;
        value.total -= count;
        value.selected = 0;
        return {
          rowCount: overrides.deleteMismatch ? count + 1 : count,
          rows: [],
        };
      }
      return { rows: [] };
    },
  };
  return { calls, db, getData: () => data };
}
const api = (extra = {}) =>
  vi
    .fn<typeof fetch>()
    .mockImplementation(() =>
      Promise.resolve(Response.json({ branch: { ...branch, ...extra } }))
    );

describe("auth reset CLI", () => {
  it("defaults to dry-run and confirmation alone never enables deletion", () => {
    expect(parseResetOptions(["--branch", "auth-rehearsal"])).toEqual({
      branch: "auth-rehearsal",
      execute: false,
    });
    expect(
      parseResetOptions(["--branch", "auth-rehearsal", "--confirm"])
    ).toEqual({ branch: "auth-rehearsal", execute: false });
    expect(
      parseResetOptions([
        "--branch",
        "auth-rehearsal",
        "--execute",
        "--confirm",
      ])
    ).toEqual({ branch: "auth-rehearsal", execute: true });
  });
  it.each(
    [
      [],
      ["--confirm"],
      ["--branch"],
      ["--branch", "--confirm"],
      ["--branch", "auth-rehearsal", "--execute"],
      ["--branch", "auth-rehearsal", "--execute", "--dry-run", "--confirm"],
      ["--branch", "auth-rehearsal", "--confirm", "--confirm"],
      ["--branch", " auth-rehearsal"],
      ["--branch", "auth-rehearsal", "--invented"],
    ].map((args) => ({ args }))
  )("refuses incomplete or conflicting options $args", ({ args }) => {
    expect(() => parseResetOptions(args)).toThrow();
  });
});

describe("named Neon branch verification", () => {
  it.each([
    { name: "other-branch" },
    { id: "br-other" },
    { project_id: "other-project" },
    { protected: true },
    { protected: undefined },
    { default: undefined },
  ])(
    "refuses mismatched, protected or incomplete branch metadata %j",
    async (extra) => {
      const { db, calls } = fixture();
      await expect(
        resetAuthData(
          db,
          { branch: branch.name, execute: true },
          "test-key",
          api(extra)
        )
      ).rejects.toThrow();
      expect(calls.some((sql) => sql.startsWith("BEGIN"))).toBe(false);
    }
  );
  it("does not infer production from a default branch designation", async () => {
    const { db } = fixture();
    await expect(
      resetAuthData(
        db,
        { branch: branch.name, execute: false },
        "test-key",
        api({ default: true, primary: true })
      )
    ).resolves.toMatchObject({ mode: "dry-run" });
  });
  it("requires API credentials and fails closed on provider errors", async () => {
    const { db, calls } = fixture();
    await expect(
      resetAuthData(db, { branch: branch.name, execute: false }, "")
    ).rejects.toThrow("NEON_API_KEY");
    await expect(
      resetAuthData(
        db,
        { branch: branch.name, execute: false },
        "test-key",
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(null, { status: 403 }))
      )
    ).rejects.toThrow("403");
    expect(calls.some((sql) => sql.startsWith("BEGIN"))).toBe(false);
  });
  it("pins the authenticated provider request to the connected branch", async () => {
    const request = api();
    await resetAuthData(
      fixture().db,
      { branch: branch.name, execute: false },
      "test-key",
      request
    );
    expect(request).toHaveBeenCalledWith(
      `https://console.neon.tech/api/v2/projects/${identity.project_id}/branches/${identity.branch_id}`,
      expect.objectContaining({
        headers: { Authorization: "Bearer test-key" },
        redirect: "error",
      })
    );
  });
});

describe("Clerk-only reset planning and atomic execution", () => {
  it("reports every table without changing data in its default mode", async () => {
    const { db, calls, getData } = fixture();
    const report = await resetAuthData(
      db,
      { branch: branch.name, execute: false },
      "test-key",
      api()
    );
    expect(report.tables).toHaveLength(7);
    expect(
      report.tables.find((row) => row.table === "public.auth_users")
    ).toMatchObject({ deletedRows: 0, selectedRows: 0, totalRows: 4 });
    expect(
      report.tables.find((row) => row.table === "public.xero_authorisations")
    ).toMatchObject({ selectedRows: 1, totalRows: 3 });
    expect(getData()).toEqual(rows());
    expect(calls.some((sql) => mutationPattern.test(sql))).toBe(false);
    expect(calls).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(calls.at(-1)).toBe("ROLLBACK");
  });
  it("deletes children first using fixed IDs and retains Better Auth/global/shared rows", async () => {
    const { db, calls, getData } = fixture();
    const request = api();
    const report = await resetAuthData(
      db,
      { branch: branch.name, execute: true },
      "test-key",
      request
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      calls.some(
        (sql) =>
          sql.includes("LOCK TABLE") && sql.includes("SHARE ROW EXCLUSIVE")
      )
    ).toBe(true);
    const deletes = calls.filter((sql) => sql.startsWith("DELETE"));
    expect(deletes).toHaveLength(5);
    expect(deletes.findIndex((sql) => sql.includes('"people"'))).toBeLessThan(
      deletes.findIndex((sql) => sql.includes('"organisations"'))
    );
    expect(
      deletes.findIndex((sql) => sql.includes('"xero_connections"'))
    ).toBeLessThan(
      deletes.findIndex((sql) => sql.includes('"xero_authorisations"'))
    );
    expect(deletes.every((sql) => sql.includes("pg_temp."))).toBe(true);
    expect(calls.at(-1)).toBe("COMMIT");
    expect(
      calls.some((sql) =>
        sql.includes(
          'child."organisation_id" = parent."id" AND child."account_id" = parent."account_id"'
        )
      )
    ).toBe(true);
    expect(getData().get("auth_users")).toEqual({ selected: 0, total: 4 });
    expect(getData().get("plans")).toEqual({ selected: 0, total: 3 });
    expect(getData().get("xero_authorisations")).toEqual({
      selected: 0,
      total: 2,
    });
    expect(report.tables.reduce((sum, row) => sum + row.deletedRows, 0)).toBe(
      10
    );
    const capture = calls.find((sql) =>
      sql.includes('FROM "public"."xero_authorisations" t WHERE')
    );
    expect(capture).toContain("NOT EXISTS");
    expect(capture).toContain(
      "pg_catalog.left(child.\"account_id\", 4) = 'org_'"
    );
  });
  it("refuses a cross-scope dependent before any delete or cascade can occur", async () => {
    const { db, calls, getData } = fixture({ blocked: true });
    await expect(
      resetAuthData(
        db,
        { branch: branch.name, execute: true },
        "test-key",
        api()
      )
    ).rejects.toThrow("outside Clerk scope");
    expect(calls.some((sql) => sql.startsWith("DELETE"))).toBe(false);
    expect(calls.at(-1)).toBe("ROLLBACK");
    expect(getData()).toEqual(rows());
  });
  it("treats a nullable account FK child as outside scope before deleting its parent", async () => {
    const { db, calls } = fixture({ nullableReferenceTo: "organisations" });
    await expect(
      resetAuthData(
        db,
        { branch: branch.name, execute: true },
        "test-key",
        api()
      )
    ).rejects.toThrow("outside Clerk scope");
    const query = calls.find(
      (sql) =>
        sql.includes('"stripe_events" child JOIN') &&
        sql.includes(" AS blocked")
    );
    expect(query).toContain(
      "(pg_catalog.left(child.\"account_id\", 4) = 'org_') IS NOT TRUE"
    );
    expect(calls.some((sql) => sql.startsWith("DELETE"))).toBe(false);
  });
  it("retains a grant referenced by a nullable-account row", async () => {
    const { db, calls } = fixture({
      nullableReferenceTo: "xero_authorisations",
    });
    const report = await resetAuthData(
      db,
      { branch: branch.name, execute: false },
      "test-key",
      api()
    );
    const query = calls.find(
      (sql) =>
        sql.startsWith("SELECT count(*)") &&
        sql.endsWith('FROM "public"."xero_authorisations" t')
    );
    expect(query).toContain(
      'NOT EXISTS (SELECT 1 FROM "public"."stripe_events" child'
    );
    expect(query).toContain(
      "(pg_catalog.left(child.\"account_id\", 4) = 'org_') IS NOT TRUE"
    );
    expect(
      report.tables.find((row) => row.table === "public.xero_authorisations")
    ).toMatchObject({ selectedRows: 0, totalRows: 3 });
  });
  it("rolls back the entire reset when a deletion count differs", async () => {
    const { db, calls, getData } = fixture({ deleteMismatch: true });
    await expect(
      resetAuthData(
        db,
        { branch: branch.name, execute: true },
        "test-key",
        api()
      )
    ).rejects.toThrow("row count changed");
    expect(calls.at(-1)).toBe("ROLLBACK");
    expect(getData()).toEqual(rows());
  });
  it.each([{ changedCatalogue: true }, { unsafeRls: true }])(
    "refuses unstable or RLS-filtered catalogues %j",
    async (options) => {
      const { db, calls } = fixture(options);
      await expect(
        resetAuthData(
          db,
          { branch: branch.name, execute: true },
          "test-key",
          api()
        )
      ).rejects.toThrow();
      expect(calls.some((sql) => sql.startsWith("DELETE"))).toBe(false);
      expect(calls.at(-1)).toBe("ROLLBACK");
    }
  );
  it("orders composite dependency edges and refuses non-self cycles", () => {
    expect(
      deletionOrder(
        ["org", "people", "records"],
        [
          { child: "people", parent: "people" },
          { child: "people", parent: "org" },
          { child: "records", parent: "people" },
        ]
      )
    ).toEqual(["records", "people", "org"]);
    expect(() =>
      deletionOrder(
        ["a", "b"],
        [
          { child: "a", parent: "b" },
          { child: "b", parent: "a" },
        ]
      )
    ).toThrow("cyclic");
  });
});
