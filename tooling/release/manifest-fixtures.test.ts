import { describe, expect, it } from "vitest";
import {
  LIVE_FIXTURE_GLOBAL_KEY_KINDS,
  REQUIRED_LIVE_FIXTURE_TENANT_SLOTS,
} from "../../packages/database/src/live-test-fixture.js";
import {
  createLiveManifestOwnership,
  REQUIRED_GLOBAL_KEY_COUNTS,
} from "./manifest-fixtures.js";

const PLAN_ID_KEY = /^plan_id:[0-9a-f-]{36}$/;
const PROVIDER_APP_KEY = /^provider_app:release_provider_app_/;
const STRIPE_EVENT_KEY = /^stripe_event:evt_release_/;
const runId = "018f47d8-3c0a-7f95-8c77-44f4be5c3210";
let sequence = 0;
const uuid = () => {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
};

describe("protected manifest fixture ownership", () => {
  it("allocates the complete registry without duplicate ownership", () => {
    const ownership = createLiveManifestOwnership({ runId, uuid });
    expect(ownership.clerkOrgIds).toHaveLength(
      REQUIRED_LIVE_FIXTURE_TENANT_SLOTS
    );
    expect(ownership.organisationIds).toHaveLength(
      REQUIRED_LIVE_FIXTURE_TENANT_SLOTS
    );
    expect(new Set(ownership.clerkOrgIds)).toHaveLength(
      ownership.clerkOrgIds.length
    );
    expect(new Set(ownership.organisationIds)).toHaveLength(
      ownership.organisationIds.length
    );
    expect(new Set(ownership.globalKeys)).toHaveLength(
      ownership.globalKeys.length
    );
    for (const kind of LIVE_FIXTURE_GLOBAL_KEY_KINDS) {
      expect(
        ownership.globalKeys.filter((key) => key.startsWith(`${kind}:`))
      ).toHaveLength(REQUIRED_GLOBAL_KEY_COUNTS[kind]);
    }
  });

  it("uses provider-compatible values for typed global ownership", () => {
    const ownership = createLiveManifestOwnership({ runId, uuid });
    expect(
      ownership.globalKeys.find((key) => key.startsWith("stripe_event:"))
    ).toMatch(STRIPE_EVENT_KEY);
    expect(
      ownership.globalKeys.find((key) => key.startsWith("provider_app:"))
    ).toMatch(PROVIDER_APP_KEY);
    expect(
      ownership.globalKeys.find((key) => key.startsWith("plan_id:"))
    ).toMatch(PLAN_ID_KEY);
  });
});
