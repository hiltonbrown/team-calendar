import path from "node:path";
import { fileURLToPath } from "node:url";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { PrismaClient } from "./generated/client";
import { seedDevelopmentData } from "./src/seed/seed";

// Standalone development seed entrypoint.
//
// Run from the repo root with: cd packages/database && bun run seed
//
// Constructs its own Prisma client (rather than importing the server-only
// singleton in src/client.ts) so it runs as a plain script. Loads DATABASE_URL
// from packages/database/.env, mirroring prisma.config.ts.

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
  const summary = await seedDevelopmentData(db, {
    clerkOrgId: process.env.SEED_CLERK_ORG_ID,
  });

  process.stdout.write(
    `Seeded development data for clerk_org_id "${summary.clerkOrgId}": ` +
      `${summary.organisations} organisations, ${summary.teams} teams, ` +
      `${summary.locations} locations, ${summary.people} people.\n`
  );
} finally {
  await db.$disconnect();
}
