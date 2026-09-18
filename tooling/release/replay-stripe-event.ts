import { retrieveStripeEvent } from "@repo/billing";
import { deliverStripeEvent } from "../../apps/api/lib/stripe-event-delivery.js";

const [, , eventId, confirmation] = process.argv;

if (!eventId?.startsWith("evt_") || confirmation !== "--confirm") {
  throw new Error("Usage: replay-stripe-event <evt_...> --confirm");
}

const retrieved = await retrieveStripeEvent(eventId);
if (!retrieved.ok) {
  throw new Error(retrieved.error.message);
}
const delivery = await deliverStripeEvent(retrieved.value);
if (!delivery.ok) {
  throw new Error(`Stripe event replay failed with status ${delivery.status}.`);
}
process.stdout.write(
  delivery.alreadyComplete
    ? `Stripe event ${eventId} is already complete.\n`
    : `Stripe event ${eventId} replay completed.\n`
);
