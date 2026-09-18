import { constructEvent } from "@repo/billing";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { deliverStripeEvent } from "../../../lib/stripe-event-delivery.js";

export async function POST(request: Request) {
  const eventResult = constructEvent(
    await request.text(),
    request.headers.get("stripe-signature"),
    env.STRIPE_WEBHOOK_SECRET
  );
  if (!eventResult.ok) {
    return NextResponse.json(
      { error: eventResult.error.message },
      { status: eventResult.error.code === "internal" ? 503 : 400 }
    );
  }
  const delivery = await deliverStripeEvent(eventResult.value);
  return delivery.ok
    ? NextResponse.json({ received: true })
    : NextResponse.json(
        { error: "Billing event processing failed" },
        { status: delivery.status }
      );
}
