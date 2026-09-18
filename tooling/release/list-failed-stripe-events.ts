import { getFailedStripeEventsForOperators } from "@repo/database";

const failures = await getFailedStripeEventsForOperators();
if (failures.length === 0) {
  process.stdout.write("No failed Stripe event deliveries.\n");
} else {
  for (const failure of failures) {
    process.stdout.write(
      `${failure.eventId}\t${failure.errorCategory}\t${failure.clerkOrgId ?? "unmatched"}\t${failure.lastAttemptedAt.toISOString()}\n`
    );
  }
}
