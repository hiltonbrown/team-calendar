import { retrieveStripeEvent } from "@repo/billing";
import {
  isStripeEventProcessed,
  recordStripeEvent,
  recordStripeEventFailure,
  recordStripeEventIgnored,
} from "@repo/database";
import { processStripeEvent } from "../../apps/api/app/webhooks/payments/route.js";

const [, , eventId, confirmation] = process.argv;

if (!eventId?.startsWith("evt_")) {
  throw new Error("Usage: replay-stripe-event <evt_...> --confirm");
}
if (confirmation !== "--confirm") {
  throw new Error("Pass --confirm after the exact event ID.");
}

const retrieved = await retrieveStripeEvent(eventId);
if (!retrieved.ok) {
  throw new Error(retrieved.error.message);
}
const event = retrieved.value;

if (await isStripeEventProcessed(event.id)) {
  process.stdout.write(`Stripe event ${event.id} is already complete.\n`);
  process.exit(0);
}

const result = await processStripeEvent(event);
const eventCreatedAt = event.created ? new Date(event.created * 1000) : null;

if (!result.ok) {
  await recordStripeEventFailure({
    clerkOrgId: result.clerkOrgId ?? null,
    errorCategory: result.errorCategory ?? "processing_failure",
    eventCreatedAt,
    eventId: event.id,
    stripeCustomerId: result.stripeCustomerId ?? null,
    type: event.type,
  });
  throw new Error(
    `Stripe event replay failed: ${result.errorCategory ?? "processing_failure"}`
  );
}

if (result.disposition === "ignored") {
  await recordStripeEventIgnored(event.id, event.type, eventCreatedAt);
} else {
  await recordStripeEvent(event.id, event.type, {
    clerkOrgId: result.clerkOrgId ?? null,
    eventCreatedAt,
    stripeCustomerId: result.stripeCustomerId ?? null,
  });
}

process.stdout.write(`Stripe event ${event.id} replay completed.\n`);
