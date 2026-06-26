import { brandNameSlug } from "@repo/seo/branding";
import { Inngest } from "inngest";
import { keys } from "../keys";

// keys() validates the Inngest credential formats and enforces that the event
// and signing keys are configured together, throwing during env validation if
// only one is set. Passing the validated values to the client keeps the
// dependency explicit rather than relying on the SDK reading process.env.
const { INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY } = keys();

export const inngest = new Inngest({
  eventKey: INNGEST_EVENT_KEY,
  id: brandNameSlug,
  signingKey: INNGEST_SIGNING_KEY,
});
