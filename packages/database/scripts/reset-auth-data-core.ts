import { z } from "zod";

export class ResetRefusal extends Error {}

export interface ResetOptions {
  branch: string;
  execute: boolean;
}
export interface ResetConnection {
  query: (
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
}
export interface ResetReport {
  branch: string;
  branchId: string;
  mode: "dry-run" | "execute";
  projectId: string;
  tables: {
    table: string;
    totalRows: number;
    selectedRows: number;
    deletedRows: number;
  }[];
}
export const resetUsage =
  "bun packages/database/scripts/reset-auth-data.ts --branch <exact-name> [--dry-run | --execute --confirm]";

function readBranchName(tokens: Iterator<string>): string {
  const branch = z.string().min(1).max(256).parse(tokens.next().value);
  if (branch.startsWith("--") || branch.trim() !== branch) {
    throw new ResetRefusal("--branch requires an exact Neon branch name");
  }
  return branch;
}

export function parseResetOptions(args: readonly string[]): ResetOptions {
  let branch: string | undefined;
  let execute = false;
  let dryRun = false;
  let confirm = false;
  const seen = new Set<string>();
  const tokens = args.values();
  for (const flag of tokens) {
    if (seen.has(flag)) {
      throw new ResetRefusal(`Duplicate option: ${flag}`);
    }
    seen.add(flag);
    if (flag === "--branch") {
      branch = readBranchName(tokens);
    } else if (flag === "--execute") {
      execute = true;
    } else if (flag === "--dry-run") {
      dryRun = true;
    } else if (flag === "--confirm") {
      confirm = true;
    } else {
      throw new ResetRefusal("Unknown reset option");
    }
  }
  if (!branch) {
    throw new ResetRefusal("An exact --branch name is required");
  }
  if (execute && dryRun) {
    throw new ResetRefusal("--execute conflicts with --dry-run");
  }
  if (execute && !confirm) {
    throw new ResetRefusal("Deletion requires both --execute and --confirm");
  }
  return { branch, execute };
}

const identitySchema = z.object({
  branch_id: z.string().regex(/^br-[a-zA-Z0-9-]+$/),
  database: z.string().min(1),
  endpoint_id: z.string().regex(/^ep-[a-zA-Z0-9-]+$/),
  project_id: z.string().regex(/^[a-zA-Z0-9-]+$/),
  role: z.string().min(1),
});
const branchSchema = z.object({
  branch: z.object({
    default: z.boolean(),
    id: z.string(),
    name: z.string(),
    primary: z.boolean(),
    project_id: z.string(),
    protected: z.boolean(),
  }),
});
const tableSchema = z.object({
  account_text: z.boolean(),
  id_key: z.boolean(),
  name: z.string(),
  partitioned: z.boolean(),
  rls_active: z.boolean(),
  schema: z.string(),
});
const foreignKeySchema = z
  .object({
    child_columns: z.array(z.string()).min(1),
    child_name: z.string(),
    child_schema: z.string(),
    name: z.string(),
    parent_columns: z.array(z.string()).min(1),
    parent_name: z.string(),
    parent_schema: z.string(),
  })
  .refine((key) => key.child_columns.length === key.parent_columns.length);
type Table = z.infer<typeof tableSchema>;
type ForeignKey = z.infer<typeof foreignKeySchema>;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const keyOf = (schema: string, name: string) => `${schema}.${name}`;
const qualified = (table: Pick<Table, "schema" | "name">) =>
  `${quote(table.schema)}.${quote(table.name)}`;
const clerkScope = (alias: string) =>
  `pg_catalog.left(${alias}."account_id", 4) = 'org_'`;
const identitySql =
  "SELECT current_database() AS database, current_user AS role, current_setting('neon.project_id', true) AS project_id, current_setting('neon.branch_id', true) AS branch_id, current_setting('neon.endpoint_id', true) AS endpoint_id";

async function verifyBranch(
  db: ResetConnection,
  branchName: string,
  apiKey: string,
  request: typeof fetch
) {
  const identity = identitySchema.parse((await db.query(identitySql)).rows[0]);
  if (identity.role === "team_calendar_app") {
    throw new ResetRefusal(
      "Reset requires the owner DATABASE_URL, not the RLS tenant role"
    );
  }
  const response = await request(
    `https://console.neon.tech/api/v2/projects/${encodeURIComponent(identity.project_id)}/branches/${encodeURIComponent(identity.branch_id)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok) {
    throw new ResetRefusal(
      `Neon branch verification failed (${response.status})`
    );
  }
  const body = await response.text();
  if (body.length > 65_536) {
    throw new ResetRefusal("Neon branch response is too large");
  }
  const { branch } = branchSchema.parse(JSON.parse(body));
  if (
    branch.id !== identity.branch_id ||
    branch.project_id !== identity.project_id ||
    branch.name !== branchName
  ) {
    throw new ResetRefusal(
      "Named Neon branch does not match the connected database"
    );
  }
  if (branch.protected) {
    throw new ResetRefusal("Reset refuses a protected Neon branch");
  }
  return identity;
}

async function catalogue(db: ResetConnection) {
  const tables = z.array(tableSchema).parse(
    (
      await db.query(`
    SELECT n.nspname::text AS schema, c.relname::text AS name,
      EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='account_id' AND NOT a.attisdropped AND a.atttypid IN ('text'::regtype,'varchar'::regtype)) AS account_text,
      EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.conkey[1] WHERE k.conrelid=c.oid AND k.contype='p' AND cardinality(k.conkey)=1 AND a.attname='id') AS id_key,
      (c.relispartition OR c.relkind='p') AS partitioned, row_security_active(c.oid) AS rls_active
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname <> '_prisma_migrations'
    ORDER BY n.nspname,c.relname
  `)
    ).rows
  );
  const foreignKeys = z.array(foreignKeySchema).parse(
    (
      await db.query(`
    SELECT k.conname::text AS name, cn.nspname::text AS child_schema, c.relname::text AS child_name,
      pn.nspname::text AS parent_schema, p.relname::text AS parent_name,
      ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY AS u(attnum,pos) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=u.attnum ORDER BY u.pos) AS child_columns,
      ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY AS u(attnum,pos) JOIN pg_attribute a ON a.attrelid=p.oid AND a.attnum=u.attnum ORDER BY u.pos) AS parent_columns
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
    JOIN pg_class p ON p.oid=k.confrelid JOIN pg_namespace pn ON pn.oid=p.relnamespace
    WHERE k.contype='f' AND (cn.nspname='public' OR pn.nspname='public') ORDER BY cn.nspname,c.relname,k.conname
  `)
    ).rows
  );
  if (tables.length === 0) {
    throw new ResetRefusal("No application tables found");
  }
  return { foreignKeys, tables };
}
const joinColumns = (fk: ForeignKey) =>
  fk.child_columns
    .map(
      (column, index) =>
        `child.${quote(column)} = parent.${quote(fk.parent_columns[index])}`
    )
    .join(" AND ");
type Scope = (alias: string) => string;

function grantScope(
  foreignKeys: ForeignKey[],
  scopes: Map<string, Scope>
): Scope {
  const references = foreignKeys.filter(
    (fk) =>
      fk.parent_schema === "public" && fk.parent_name === "xero_authorisations"
  );
  const provenSources = references.filter(
    (fk) =>
      fk.child_schema === "public" &&
      ["xero_connections", "xero_oauth_sessions"].includes(fk.child_name)
  );
  if (provenSources.length !== 2) {
    throw new ResetRefusal(
      "Canonical Xero grant references differ from the reviewed schema"
    );
  }
  return (alias) => {
    const connection = (fk: ForeignKey) =>
      fk.child_columns
        .map(
          (column, index) =>
            `child.${quote(column)} = ${alias}.${quote(fk.parent_columns[index])}`
        )
        .join(" AND ");
    const source = provenSources
      .map(
        (fk) =>
          `EXISTS (SELECT 1 FROM ${quote(fk.child_schema)}.${quote(fk.child_name)} child WHERE ${connection(fk)} AND ${clerkScope("child")})`
      )
      .join(" OR ");
    const notShared = references
      .map((fk) => {
        const selected = scopes.get(keyOf(fk.child_schema, fk.child_name));
        return `NOT EXISTS (SELECT 1 FROM ${quote(fk.child_schema)}.${quote(fk.child_name)} child WHERE ${connection(fk)} AND (${selected ? selected("child") : "FALSE"}) IS NOT TRUE)`;
      })
      .join(" AND ");
    return `(${source}) AND (${notShared})`;
  };
}

export function deletionOrder(
  names: readonly string[],
  edges: readonly { child: string; parent: string }[]
): string[] {
  const remaining = new Set(names);
  const result: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter(
        (name) =>
          !edges.some(
            (edge) =>
              edge.parent === name &&
              edge.child !== name &&
              remaining.has(edge.child)
          )
      )
      .sort();
    if (ready.length === 0) {
      throw new ResetRefusal("Reset refuses cyclic table dependencies");
    }
    for (const name of ready) {
      remaining.delete(name);
      result.push(name);
    }
  }
  return result;
}

async function rejectOutsideDependencies(
  db: ResetConnection,
  foreignKeys: ForeignKey[],
  scopes: Map<string, Scope>
) {
  for (const fk of foreignKeys) {
    const parent = scopes.get(keyOf(fk.parent_schema, fk.parent_name));
    if (!parent) {
      continue;
    }
    const child = scopes.get(keyOf(fk.child_schema, fk.child_name));
    const result = await db.query(
      `SELECT EXISTS (SELECT 1 FROM ${quote(fk.child_schema)}.${quote(fk.child_name)} child JOIN ${quote(fk.parent_schema)}.${quote(fk.parent_name)} parent ON ${joinColumns(fk)} WHERE (${parent("parent")}) AND (${child ? child("child") : "FALSE"}) IS NOT TRUE) AS blocked`
    );
    if (z.object({ blocked: z.boolean() }).parse(result.rows[0]).blocked) {
      throw new ResetRefusal(
        `Reset would affect data outside Clerk scope through ${fk.child_schema}.${fk.child_name} (${fk.name})`
      );
    }
  }
}

const countPattern = /^\d+$/;
const safeCount = (value: string) =>
  z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .parse(Number(z.string().regex(countPattern).parse(value)));
async function counts(
  db: ResetConnection,
  tables: Table[],
  scopes: Map<string, Scope>
): Promise<ResetReport["tables"]> {
  const result: ResetReport["tables"] = [];
  for (const table of tables) {
    const scope = scopes.get(keyOf(table.schema, table.name));
    const row = z
      .object({ selected: z.string(), total: z.string() })
      .parse(
        (
          await db.query(
            `SELECT count(*)::text AS total, count(*) FILTER (WHERE ${scope ? scope("t") : "FALSE"})::text AS selected FROM ${qualified(table)} t`
          )
        ).rows[0]
      );
    result.push({
      deletedRows: 0,
      selectedRows: safeCount(row.selected),
      table: keyOf(table.schema, table.name),
      totalRows: safeCount(row.total),
    });
  }
  return result;
}

function buildScopes(initial: Awaited<ReturnType<typeof catalogue>>) {
  const scopes = new Map<string, Scope>();
  const selected = initial.tables.filter(
    (table) => table.account_text || table.name === "xero_authorisations"
  );
  for (const table of selected) {
    if (!table.id_key || table.partitioned || table.rls_active) {
      throw new ResetRefusal(
        `Reset needs an owner-visible, unpartitioned id-key table: ${table.name}`
      );
    }
    if (table.account_text) {
      scopes.set(keyOf(table.schema, table.name), clerkScope);
    }
  }
  if (!scopes.has("public.organisations")) {
    throw new ResetRefusal("Tenant organisation boundary is absent");
  }
  if (selected.some((table) => table.name === "xero_authorisations")) {
    scopes.set(
      "public.xero_authorisations",
      grantScope(initial.foreignKeys, scopes)
    );
  }
  return { scopes, selected };
}

/** Dry runs only read data. Execute locks and captures the exact IDs before deleting. */
export async function resetAuthData(
  db: ResetConnection,
  options: ResetOptions,
  apiKey: string,
  request: typeof fetch = fetch
): Promise<ResetReport> {
  if (!apiKey.trim()) {
    throw new ResetRefusal(
      "NEON_API_KEY is required to verify the named branch"
    );
  }
  if (!options.branch || options.branch.trim() !== options.branch) {
    throw new ResetRefusal("An exact branch name is required");
  }
  const identity = await verifyBranch(db, options.branch, apiKey, request);
  const initial = await catalogue(db);
  let transaction = false;
  try {
    await db.query(
      options.execute
        ? "BEGIN"
        : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
    );
    transaction = true;
    await db.query("SET LOCAL lock_timeout = '5s'");
    await db.query("SET LOCAL statement_timeout = '60s'");
    await db.query("SET LOCAL search_path = pg_catalog, pg_temp");
    if (options.execute) {
      await db.query(
        `LOCK TABLE ${initial.tables.map(qualified).join(", ")} IN SHARE ROW EXCLUSIVE MODE`
      );
      if (JSON.stringify(await catalogue(db)) !== JSON.stringify(initial)) {
        throw new ResetRefusal(
          "Database catalogue changed before reset locks were acquired"
        );
      }
      const confirmed = await verifyBranch(db, options.branch, apiKey, request);
      if (JSON.stringify(confirmed) !== JSON.stringify(identity)) {
        throw new ResetRefusal("Neon database identity changed before reset");
      }
    }
    const { scopes, selected } = buildScopes(initial);
    const before = await counts(db, initial.tables, scopes);
    await rejectOutsideDependencies(db, initial.foreignKeys, scopes);
    if (options.execute) {
      await deleteSelected(
        db,
        selected,
        initial.tables,
        initial.foreignKeys,
        scopes,
        before
      );
    }
    await db.query(options.execute ? "COMMIT" : "ROLLBACK");
    transaction = false;
    return {
      branch: options.branch,
      branchId: identity.branch_id,
      mode: options.execute ? "execute" : "dry-run",
      projectId: identity.project_id,
      tables: before,
    };
  } catch (error) {
    if (transaction) {
      await db.query("ROLLBACK");
    }
    throw error;
  }
}

async function deleteSelected(
  db: ResetConnection,
  tables: Table[],
  allTables: Table[],
  foreignKeys: ForeignKey[],
  scopes: Map<string, Scope>,
  before: ResetReport["tables"]
) {
  const fixedScopes = new Map<string, Scope>();
  for (const [index, table] of tables.entries()) {
    const key = keyOf(table.schema, table.name);
    const scope = scopes.get(key);
    if (!scope) {
      throw new ResetRefusal("Reset selection is incomplete");
    }
    const temp = quote(`reset_auth_scope_${index}`);
    await db.query(
      `CREATE TEMP TABLE ${temp} ON COMMIT DROP AS SELECT t.id FROM ${qualified(table)} t WHERE ${scope("t")}`
    );
    fixedScopes.set(
      key,
      (alias) => `${alias}.id IN (SELECT id FROM pg_temp.${temp})`
    );
  }
  const edges = foreignKeys.map((fk) => ({
    child: keyOf(fk.child_schema, fk.child_name),
    parent: keyOf(fk.parent_schema, fk.parent_name),
  }));
  for (const name of deletionOrder([...fixedScopes.keys()], edges)) {
    const table = tables.find(
      (candidate) => keyOf(candidate.schema, candidate.name) === name
    );
    const scope = fixedScopes.get(name);
    const summary = before.find((row) => row.table === name);
    if (!(table && scope && summary)) {
      throw new ResetRefusal("Reset deletion plan is incomplete");
    }
    const result = await db.query(
      `DELETE FROM ${qualified(table)} t WHERE ${scope("t")}`
    );
    if (result.rowCount !== summary.selectedRows) {
      throw new ResetRefusal(`Reset row count changed in ${name}`);
    }
    summary.deletedRows = result.rowCount;
  }
  const after = await counts(db, allTables, fixedScopes);
  for (const row of after) {
    const original = before.find((entry) => entry.table === row.table);
    if (
      !original ||
      row.selectedRows !== 0 ||
      row.totalRows !== original.totalRows - original.selectedRows
    ) {
      throw new ResetRefusal(`Reset verification failed in ${row.table}`);
    }
  }
}
