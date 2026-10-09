import "server-only";

import { analytics } from "@repo/analytics/server";
import { log } from "@repo/observability/log";

// Onboarding events are captured server-side, like other product events;
// a capture failure never affects the setup flow.
export async function captureOnboardingEvent(input: {
  distinctId: string;
  event:
    | "Member Welcome Completed"
    | "Onboarding Completed"
    | "Onboarding Step Completed";
  properties: Record<string, string | number | boolean>;
}): Promise<void> {
  try {
    analytics?.capture({
      distinctId: input.distinctId,
      event: input.event,
      properties: input.properties,
    });
    await analytics?.flush();
  } catch (error) {
    log.warn("Onboarding analytics capture failed", {
      error,
      event: input.event,
    });
  }
}
