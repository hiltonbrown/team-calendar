import "server-only";
import type { Prisma } from "@repo/database/generated/client";
import { remainingMs, type XeroDeadline } from "../rate-limit/deadline";

// Lock order: sorted owners, sorted bindings, sorted connections, then session claims.
// SQL lock_timeout is the first transaction statement, bounded by the absolute deadline.
export async function boundXeroLocks(
  tx: Prisma.TransactionClient,
  deadline: XeroDeadline
) {
  const budget = remainingMs(deadline);
  if (budget < 1) {
    throw new Error("Xero operation deadline exceeded");
  }
  await tx.$executeRaw`SELECT set_config('lock_timeout', ${`${budget}ms`}, true)`;
}
export async function lockXeroOwner(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-owner:${id}`}, 0))::text AS acquired`;
}
export async function lockXeroBinding(
  tx: Prisma.TransactionClient,
  id: string
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-binding:${id}`}, 0))::text AS acquired`;
}
export async function lockXeroConnection(
  tx: Prisma.TransactionClient,
  id: string
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text AS acquired`;
}
