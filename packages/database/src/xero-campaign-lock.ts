import type { Prisma } from "../generated/client";

/** Control transitions and tenant batch writes take this lock before binding locks. */
export async function lockXeroCampaign(
  tx: Prisma.TransactionClient,
  credentialDomainId: string
) {
  await tx.$executeRaw`SELECT set_config('lock_timeout', ${"10000ms"}, true)`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-campaign:${credentialDomainId}`}, 0))::text AS acquired`;
}
