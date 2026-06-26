import "server-only";

import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";
import { PrismaClient } from "../generated/client";
import { keys } from "../keys";

declare global {
  var __teamCalendarDatabase: PrismaClient | undefined;
}

// The Neon serverless adapter speaks Neon's WebSocket protocol, which a plain
// Postgres (local dev, CI service container) cannot answer. Detect a local host
// and fall back to the node-postgres adapter so integration tests run against a
// vanilla Postgres while production keeps using the Neon driver.
const isLocalDatabase = (connectionString: string): boolean => {
  try {
    const { hostname } = new URL(connectionString);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
};

const createDatabaseClient = (): PrismaClient => {
  const connectionString = keys().DATABASE_URL;

  if (isLocalDatabase(connectionString)) {
    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({ adapter });
  }

  neonConfig.webSocketConstructor = ws;
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
};

export const database =
  globalThis.__teamCalendarDatabase ?? createDatabaseClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__teamCalendarDatabase = database;
}

export type Database = PrismaClient;
