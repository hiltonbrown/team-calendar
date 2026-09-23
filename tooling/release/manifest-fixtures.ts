import { randomUUID } from "node:crypto";
import {
  type GlobalKeyKind,
  LIVE_FIXTURE_GLOBAL_KEY_KINDS,
  LIVE_FIXTURE_SUITES,
  REQUIRED_LIVE_FIXTURE_TENANT_SLOTS,
} from "../../packages/database/src/live-test-fixture.js";

const UUID_GLOBAL_KEY_KINDS = new Set<GlobalKeyKind>([
  "plan_id",
  "credential_owner",
  "provider_connection",
  "tenant_binding",
  "oauth_attempt",
  "cleanup_request",
  "cleanup_attempt",
]);

export const REQUIRED_GLOBAL_KEY_COUNTS = Object.freeze(
  Object.fromEntries(
    LIVE_FIXTURE_GLOBAL_KEY_KINDS.map((kind) => [
      kind,
      Object.values(LIVE_FIXTURE_SUITES).reduce(
        (total, allocation) =>
          total +
          ("globalKeys" in allocation ? (allocation.globalKeys[kind] ?? 0) : 0),
        0
      ),
    ])
  ) as Record<GlobalKeyKind, number>
);

const valueFor = (input: {
  index: number;
  kind: GlobalKeyKind;
  runMarker: string;
  uuid: () => string;
}): string => {
  if (UUID_GLOBAL_KEY_KINDS.has(input.kind)) {
    return input.uuid();
  }
  const slot = String(input.index + 1).padStart(2, "0");
  if (input.kind === "plan_key") {
    return `release_plan_${input.runMarker}_${slot}`;
  }
  if (input.kind === "stripe_event") {
    return `evt_release_${input.runMarker}_${slot}`;
  }
  if (input.kind === "provider_app") {
    return `release_provider_app_${input.runMarker}_${slot}`;
  }
  return `release_shared_store_${input.runMarker}_${slot}`;
};

export const createLiveManifestOwnership = (input: {
  runId: string;
  uuid?: () => string;
}): {
  clerkOrgIds: string[];
  globalKeys: string[];
  organisationIds: string[];
} => {
  const uuid = input.uuid ?? randomUUID;
  const runMarker = input.runId.replaceAll("-", "");
  const clerkOrgIds = Array.from(
    { length: REQUIRED_LIVE_FIXTURE_TENANT_SLOTS },
    (_, index) =>
      `org_release_${runMarker}_${String(index + 1).padStart(3, "0")}`
  );
  const organisationIds = Array.from(
    { length: REQUIRED_LIVE_FIXTURE_TENANT_SLOTS },
    uuid
  );
  const globalKeys = LIVE_FIXTURE_GLOBAL_KEY_KINDS.flatMap((kind) =>
    Array.from({ length: REQUIRED_GLOBAL_KEY_COUNTS[kind] }, (_, index) => {
      const value = valueFor({ index, kind, runMarker, uuid });
      return `${kind}:${value}`;
    })
  );
  return { clerkOrgIds, globalKeys, organisationIds };
};
