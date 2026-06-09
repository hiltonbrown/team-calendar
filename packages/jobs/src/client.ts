import { Inngest } from "inngest";
import { keys } from "../keys";

// keys() validates the format of the Inngest credentials (for example, the
// signing key must start with "signkey-"). In local development the Inngest
// Dev Server needs neither key, so both may be absent. In a deployed
// environment they are required together: a half-configured pair would leave
// jobs unsigned and unable to authenticate, so fail fast rather than degrade
// silently.
const { INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY } = keys();
if (INNGEST_EVENT_KEY && !INNGEST_SIGNING_KEY) {
  throw new Error(
    "INNGEST_EVENT_KEY is set but INNGEST_SIGNING_KEY is missing. Both are required to run Inngest in a deployed environment."
  );
}
if (INNGEST_SIGNING_KEY && !INNGEST_EVENT_KEY) {
  throw new Error(
    "INNGEST_SIGNING_KEY is set but INNGEST_EVENT_KEY is missing. Both are required to run Inngest in a deployed environment."
  );
}

export const inngest = new Inngest({
  eventKey: INNGEST_EVENT_KEY,
  id: "leavesync",
  signingKey: INNGEST_SIGNING_KEY,
});
