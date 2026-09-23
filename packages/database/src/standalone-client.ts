import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";
import { PrismaClient } from "../generated/client";
import { isLocalDatabase } from "./is-local-database";

export const createStandaloneDatabaseClient = (
  connectionString: string
): PrismaClient => {
  const local = isLocalDatabase(connectionString);
  if (!local) {
    neonConfig.webSocketConstructor = ws;
  }
  const adapter = local
    ? new PrismaPg({ connectionString })
    : new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
};
