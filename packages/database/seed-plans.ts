import path from "node:path";
import { fileURLToPath } from "node:url";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { PrismaClient } from "./generated/client";
import { syncPlanCatalogue } from "./src/seed/seed-plans";

// Re-runnable seed sync for the billing catalogue.
//
// Run from the repo root with: cd packages/database && bun run seed:plans
//
// Upserts plans and plan_limits from PLAN_CATALOGUE. Idempotent: the future
// path for changing a tier is "edit packages/database/src/seed/plans.ts, run
// this sync, update the Clerk Dashboard". Constructs its own Prisma client and
// loads DATABASE_URL from packages/database/.env, mirroring seed.ts.

const here = fileURLToPath(new URL(".", import.meta.url));

try {
  process.loadEnvFile(path.join(here, ".env"));
} catch {
  // .env is optional; DATABASE_URL may already be present in the environment.
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  process.stderr.write(
    "DATABASE_URL is not set. Add it to packages/database/.env or the environment before seeding.\n"
  );
  process.exit(1);
}

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: databaseUrl });
const db = new PrismaClient({ adapter });

try {
  const summary = await syncPlanCatalogue(db);
  process.stdout.write(
    `Synced billing catalogue: ${summary.plans} plans, ${summary.limits} limits.\n`
  );
} finally {
  await db.$disconnect();
}
