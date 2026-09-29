import { vi } from "vitest";
import {
  type XeroCampaignControl,
  XeroCampaignControlSchema,
} from "./xero-campaign-contract";
import {
  type XeroCampaignStoreInput,
  xeroCampaignKeys,
} from "./xero-campaign-store";
export const uuid = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
export const reference = `sha256:${"a".repeat(64)}`;
export const scope = {
  bindingGeneration: 2,
  clerkOrgId: "org_fixture",
  organisationId: uuid(2),
  xeroTenantId: uuid(3),
};
export const campaign = { dispatchId: uuid(5), epoch: 4, runId: uuid(6) };
export const functionId = "sync-xero-leave-records";
export const authority = {
  ...scope,
  ...campaign,
  candidateSha: "a".repeat(40),
  externalTenantId: uuid(4),
};
export function controlFixture(overrides: Partial<XeroCampaignControl> = {}) {
  return XeroCampaignControlSchema.parse({
    allowedFunctions: [functionId],
    candidateSha: "a".repeat(40),
    credentialDomainId: uuid(1),
    databaseRunId: uuid(8),
    databaseTargetHash: reference,
    epoch: 4,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    manifestHash: "b".repeat(64),
    phase: "active",
    registrationObservedAt: new Date().toISOString(),
    registrationReference: reference,
    resources: [
      {
        ...scope,
        credentialOwnerId: null,
        externalTenantId: uuid(4),
        providerAppId: "fixture-app",
      },
    ],
    runId: campaign.runId,
    sanctionedActors: [],
    tickets: [
      {
        bindingGeneration: 2,
        clerkOrgId: scope.clerkOrgId,
        dispatchId: campaign.dispatchId,
        eventIds: [],
        functionId,
        organisationId: scope.organisationId,
        outcome: "reserved",
        scheduledSlot: "2026-09-29T10:00Z",
        schedulerRunId: null,
        targetHash: null,
        userId: null,
        workerRunId: null,
      },
    ],
    version: 1,
    ...overrides,
  });
}
/** Atomic command simulator, with no network or database connections. */
export function storeFixture(
  initial: XeroCampaignControl | null = controlFixture()
) {
  const keys = xeroCampaignKeys(uuid(1));
  const values = new Map<string, string>();
  values.set(
    keys.sentinel,
    JSON.stringify({
      credentialDomainId: uuid(1),
      databaseTargetHash: reference,
      version: 1,
    })
  );
  values.set("release:active-run", uuid(8));
  const writeControl = (control: XeroCampaignControl) => {
    values.set(keys.control(control.runId), JSON.stringify(control));
    for (const resource of control.resources) {
      values.set(keys.organisation(resource.organisationId), control.runId);
      values.set(
        keys.provider(resource.providerAppId, resource.externalTenantId),
        control.runId
      );
      values.set(keys.provider(resource.providerAppId), control.runId);
    }
  };
  if (initial) {
    writeControl(initial);
  }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Simulate one atomic Redis read or compare-and-set without an external service.
  const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
    const command: string[] = JSON.parse(String(init?.body));
    const count = Number(command[2]);
    const redisKeys = command.slice(3, 3 + count);
    const args = command.slice(3 + count);
    let result: unknown;
    if (command[1]?.includes("local sentinel")) {
      const pointer = args[0] || values.get(redisKeys[1] ?? "");
      result = [
        values.get(redisKeys[0] ?? "") ?? null,
        pointer ? (values.get(`${args[1]}${pointer}`) ?? null) : null,
        values.get("release:active-run") ?? null,
        pointer ?? null,
      ];
    } else {
      const key = redisKeys[0] ?? "";
      result =
        values.get(key) === args[0] &&
        values.get("release:active-run") === args[2]
          ? 1
          : 0;
      if (result === 1) {
        values.set(key, args[1] ?? "");
      }
    }
    return Promise.resolve(Response.json({ result }));
  });
  const configuration: XeroCampaignStoreInput = {
    credentialDomainId: uuid(1),
    fetchImpl,
    runtimeRevision: "a".repeat(40),
    token: "fixture-control-token",
    url: "https://fixture.invalid",
  };
  vi.stubEnv("XERO_CREDENTIAL_DOMAIN_ID", configuration.credentialDomainId);
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", configuration.runtimeRevision);
  vi.stubEnv("KV_REST_API_URL", configuration.url);
  vi.stubEnv("KV_REST_API_TOKEN", configuration.token);
  vi.stubGlobal("fetch", fetchImpl);
  const readControl = () =>
    XeroCampaignControlSchema.parse(
      JSON.parse(values.get(keys.control(campaign.runId)) ?? "null")
    );
  return { configuration, fetchImpl, keys, readControl, values, writeControl };
}
