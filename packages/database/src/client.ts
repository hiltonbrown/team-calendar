import "server-only";

import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";
import { PrismaClient } from "../generated/client";
import { keys } from "../keys";
import { isLocalDatabase } from "./is-local-database";
import { createLazyClient } from "./lazy-client";
import { assertTestDatabaseConnectionAllowed } from "./live-test-guard";

declare global {
  var __teamCalendarDatabase: PrismaClient | undefined;
}

const createDatabaseClient = (): PrismaClient => {
  assertTestDatabaseConnectionAllowed();
  const connectionString = keys().DATABASE_URL;

  if (isLocalDatabase(connectionString)) {
    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({ adapter });
  }

  neonConfig.webSocketConstructor = ws;
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
};

// Keep imports harmless for builds and mocked unit tests. The live-test guard
// runs before the first adapter or network-capable client is constructed.
export const database = createLazyClient({
  create: createDatabaseClient,
  guard: assertTestDatabaseConnectionAllowed,
  initial: globalThis.__teamCalendarDatabase,
  onCreate: (client) => {
    if (process.env.NODE_ENV !== "production") {
      globalThis.__teamCalendarDatabase = client;
    }
  },
});

export type Database = PrismaClient;
