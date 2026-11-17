import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  parseResetOptions,
  ResetRefusal,
  resetAuthData,
  resetUsage,
} from "./reset-auth-data-core";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(
      `${resetUsage}\nDefault: read-only dry-run. Requires DATABASE_URL and NEON_API_KEY. No provider resources, jobs or external caches are changed.\n`
    );
    return;
  }
  const options = parseResetOptions(args);
  try {
    process.loadEnvFile(
      path.resolve(fileURLToPath(new URL("..", import.meta.url)), ".env")
    );
  } catch (error) {
    if (
      !(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
    ) {
      throw error;
    }
  }
  const configured = process.env.DATABASE_URL;
  if (!(configured && process.env.NEON_API_KEY)) {
    throw new Error("DATABASE_URL and NEON_API_KEY are required");
  }
  const url = new URL(configured);
  if (
    !(
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      url.hostname.endsWith(".neon.tech")
    )
  ) {
    throw new Error("Reset requires a Neon Postgres DATABASE_URL");
  }
  url.hostname = url.hostname.replace("-pooler.", ".");
  // Keep certificate verification explicit; never echo the connection string.
  url.searchParams.set("sslmode", "verify-full");
  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  try {
    const report = await resetAuthData(
      {
        query: async (sql, values) => {
          const result = await client.query(sql, values);
          return { rowCount: result.rowCount, rows: result.rows };
        },
      },
      options,
      process.env.NEON_API_KEY
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    // Connection/provider exceptions can embed credentials. Detailed errors are
    // intentionally not printed by this destructive command.
    const reason =
      error instanceof ResetRefusal
        ? error.message
        : "Check the named branch, owner connection, API access and database constraints";
    process.stderr.write(
      `Auth reset refused or failed: ${reason}. ${resetUsage}\n`
    );
    process.exitCode = 1;
  });
}
