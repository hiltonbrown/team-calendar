import { createHash } from "node:crypto";
import { z } from "zod";
import { assertTestDatabaseConnectionAllowed } from "./live-test-guard";
import {
  type XeroCampaignControl,
  XeroCampaignControlSchema,
  XeroCampaignDeniedError,
  type XeroCampaignSentinel,
  XeroCampaignSentinelSchema,
} from "./xero-campaign-contract";

export interface XeroCampaignStoreInput {
  credentialDomainId: string;
  fetchImpl?: typeof fetch;
  runtimeRevision: string;
  token: string;
  url: string;
}
/** Dedicated fixture credentials never enter the provider limiter's production configuration. */
export function xeroCampaignStoreCredentials(): { token: string; url: string } {
  const testUrl = process.env.TC_TEST_KV_REST_API_URL;
  const testToken = process.env.TC_TEST_KV_REST_API_TOKEN;
  const protectedTest =
    process.env.ALLOW_LIVE_DATABASE_TESTS === "I_ACKNOWLEDGE_LIVE_MUTATION";
  if (
    testUrl !== undefined ||
    testToken !== undefined ||
    (process.env.NODE_ENV === "test" && protectedTest)
  ) {
    try {
      if (
        process.env.NODE_ENV !== "test" ||
        !protectedTest ||
        !testUrl?.trim() ||
        !testToken?.trim()
      ) {
        throw new XeroCampaignDeniedError();
      }
      assertTestDatabaseConnectionAllowed();
      return { token: testToken, url: testUrl };
    } catch {
      // biome-ignore lint/style/useErrorCause: Environment and manifest failures must not disclose protected values.
      throw new XeroCampaignDeniedError();
    }
  }
  return {
    token: process.env.KV_REST_API_TOKEN ?? "",
    url: process.env.KV_REST_API_URL ?? "",
  };
}
export function xeroCampaignStoreInput(): XeroCampaignStoreInput {
  return {
    credentialDomainId: process.env.XERO_CREDENTIAL_DOMAIN_ID ?? "",
    runtimeRevision: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    ...xeroCampaignStoreCredentials(),
  };
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function xeroCampaignKeys(domain: string) {
  const prefix = `xero:e2e:runtime:v1:${domain}`;
  return {
    active: `${prefix}:active`,
    control: (runId: string) => `${prefix}:run:${runId}`,
    organisation: (id: string) => `${prefix}:organisation:${id}`,
    provider: (app: string, tenant?: string) =>
      `${prefix}:provider:${digest(JSON.stringify([app, tenant ?? null]))}`,
    sentinel: `${prefix}:sentinel`,
  };
}
const READ = `
local sentinel = redis.call('get', KEYS[1])
local run = ARGV[1]
if run == '' then run = redis.call('get', KEYS[2]) end
local control = false
if run then control = redis.call('get', ARGV[2] .. run) end
return {sentinel or false, control or false, redis.call('get', 'release:active-run') or false, run or false}
`;
const UPDATE = `
if redis.call('get', KEYS[1]) ~= ARGV[1] or redis.call('get', 'release:active-run') ~= ARGV[3] then return 0 end
redis.call('set', KEYS[1], ARGV[2])
return 1
`;
const INITIALISE = `
if not redis.call('get', KEYS[1]) or redis.call('get', 'release:active-run') ~= ARGV[3] then return 0 end
if redis.call('exists', KEYS[2]) ~= 0 then return 0 end
for i = 3, #KEYS do
  local previous = redis.call('get', KEYS[i])
  if previous then
    local raw = redis.call('get', ARGV[4] .. previous)
    if not raw then return 0 end
    local value = cjson.decode(raw)
    if value.phase ~= 'closed' or value.epoch >= tonumber(ARGV[5]) then return 0 end
  end
end
redis.call('set', KEYS[2], ARGV[2])
for i = 3, #KEYS do redis.call('set', KEYS[i], ARGV[1]) end
return 1
`;
const readResult = z.tuple([
  z.string().nullable(),
  z.string().nullable(),
  z.string().nullable(),
  z.string().nullable(),
]);
export interface XeroCampaignSnapshot {
  control: XeroCampaignControl | null;
  raw: string | null;
  sentinel: XeroCampaignSentinel;
}

/** Missing control storage is never evidence that a resource is unreserved. */
export class XeroCampaignStore {
  readonly input: XeroCampaignStoreInput;
  readonly keys: ReturnType<typeof xeroCampaignKeys>;
  constructor(input: XeroCampaignStoreInput = xeroCampaignStoreInput()) {
    try {
      z.uuid().parse(input.credentialDomainId);
      const url = new URL(input.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !input.token.trim() ||
        NEWLINE.test(input.token)
      ) {
        throw new Error("Invalid control store");
      }
      this.input = input;
      this.keys = xeroCampaignKeys(input.credentialDomainId);
    } catch {
      // biome-ignore lint/style/useErrorCause: Redis errors may contain credentials or private control payloads.
      throw new XeroCampaignDeniedError();
    }
  }
  async command(parts: readonly string[]): Promise<unknown> {
    try {
      const response = await (this.input.fetchImpl ?? fetch)(
        this.input.url.replace(TRAILING_SLASHES, ""),
        {
          body: JSON.stringify(parts),
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${this.input.token}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (!response.ok) {
        throw new Error("Control store unavailable");
      }
      return z
        .strictObject({ result: z.unknown() })
        .parse(await response.json()).result;
    } catch {
      // biome-ignore lint/style/useErrorCause: Redis errors may contain credentials or private control payloads.
      throw new XeroCampaignDeniedError();
    }
  }
  async snapshot(
    reservationKey: string,
    runId = ""
  ): Promise<XeroCampaignSnapshot> {
    try {
      const [sentinelRaw, raw, owner, pointer] = readResult.parse(
        await this.command([
          "EVAL",
          READ,
          "2",
          this.keys.sentinel,
          reservationKey,
          runId,
          this.keys.control(""),
        ])
      );
      if (!sentinelRaw) {
        throw new XeroCampaignDeniedError();
      }
      const sentinel = XeroCampaignSentinelSchema.parse(
        JSON.parse(sentinelRaw)
      );
      if (sentinel.credentialDomainId !== this.input.credentialDomainId) {
        throw new XeroCampaignDeniedError();
      }
      if (!pointer) {
        return { control: null, raw: null, sentinel };
      }
      if (!raw) {
        throw new XeroCampaignDeniedError();
      }
      const control = XeroCampaignControlSchema.parse(JSON.parse(raw));
      if (
        control.runId !== pointer ||
        control.credentialDomainId !== sentinel.credentialDomainId ||
        control.databaseTargetHash !== sentinel.databaseTargetHash ||
        (control.phase !== "closed" && owner !== control.databaseRunId)
      ) {
        throw new XeroCampaignDeniedError();
      }
      return { control, raw, sentinel };
    } catch {
      // biome-ignore lint/style/useErrorCause: Redis errors may contain credentials or private control payloads.
      throw new XeroCampaignDeniedError();
    }
  }
  readOrganisation(organisationId: string) {
    return this.snapshot(this.keys.organisation(organisationId));
  }
  readRun(runId: string) {
    return this.snapshot(this.keys.control(runId), runId);
  }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Check immutable authority and monotonic ticket/effect evidence before the atomic update.
  async compareAndSet(
    previous: XeroCampaignSnapshot,
    next: XeroCampaignControl
  ) {
    if (!(previous.control && previous.raw)) {
      throw new XeroCampaignDeniedError();
    }
    const parsed = XeroCampaignControlSchema.parse(next);
    if (
      parsed.runId !== previous.control.runId ||
      parsed.epoch !== previous.control.epoch ||
      parsed.databaseRunId !== previous.control.databaseRunId ||
      parsed.credentialDomainId !== previous.control.credentialDomainId ||
      parsed.databaseTargetHash !== previous.control.databaseTargetHash ||
      parsed.candidateSha !== previous.control.candidateSha ||
      parsed.manifestHash !== previous.control.manifestHash
    ) {
      throw new XeroCampaignDeniedError();
    }
    const before = previous.control;
    if (parsed.phase !== before.phase) {
      const allowed: Record<
        XeroCampaignControl["phase"],
        readonly XeroCampaignControl["phase"][]
      > = {
        acquiring: ["active", "draining", "recovering"],
        active: ["draining"],
        closed: [],
        draining: ["recovering", "closed"],
        recovering: ["draining", "closed"],
      };
      if (
        !allowed[before.phase].includes(parsed.phase) ||
        (parsed.phase === "closed" &&
          (!parsed.closure ||
            parsed.effects.some((effect) => effect.outcome !== "completed") ||
            parsed.tickets.some(
              (ticket) =>
                ticket.outcome === "running" || ticket.outcome === "reserved"
            )))
      ) {
        throw new XeroCampaignDeniedError();
      }
    }

    for (const key of [
      "resources",
      "allowedFunctions",
      "sanctionedActors",
    ] as const) {
      if (JSON.stringify(parsed[key]) !== JSON.stringify(before[key])) {
        throw new XeroCampaignDeniedError();
      }
    }
    for (const effect of before.effects) {
      const updated = parsed.effects.find((entry) => entry.id === effect.id);
      if (
        !updated ||
        updated.dispatchId !== effect.dispatchId ||
        (effect.outcome !== "dispatched" && updated.outcome !== effect.outcome)
      ) {
        throw new XeroCampaignDeniedError();
      }
    }
    for (const ticket of before.tickets) {
      const updated = parsed.tickets.find(
        (entry) => entry.dispatchId === ticket.dispatchId
      );
      if (!updated) {
        throw new XeroCampaignDeniedError();
      }
      for (const key of [
        "bindingGeneration",
        "clerkOrgId",
        "organisationId",
        "functionId",
        "scheduledSlot",
        "targetHash",
        "userId",
      ] as const) {
        if (updated[key] !== ticket[key]) {
          throw new XeroCampaignDeniedError();
        }
      }
      if (
        (ticket.schedulerRunId &&
          updated.schedulerRunId !== ticket.schedulerRunId) ||
        (ticket.eventIds.length &&
          JSON.stringify(updated.eventIds) !==
            JSON.stringify(ticket.eventIds)) ||
        (ticket.outcome === "succeeded" && updated.outcome !== "succeeded")
      ) {
        throw new XeroCampaignDeniedError();
      }
    }
    const result = await this.command([
      "EVAL",
      UPDATE,
      "1",
      this.keys.control(parsed.runId),
      previous.raw,
      JSON.stringify(parsed),
      parsed.databaseRunId,
    ]);
    if (result !== 1) {
      throw new XeroCampaignDeniedError();
    }
    return parsed;
  }
  async initialise(control: XeroCampaignControl) {
    const { database, lockXeroCampaign } = await import("@repo/database");
    return database.$transaction(
      async (tx) => {
        await lockXeroCampaign(tx, this.input.credentialDomainId);
        const ownerIds = control.resources.flatMap((r) =>
          r.credentialOwnerId ? [r.credentialOwnerId] : []
        );
        const bindings = await tx.xeroTenant.findMany({
          select: {
            binding_generation: true,
            clerk_org_id: true,
            id: true,
            organisation_id: true,
            xero_credential_owner_id: true,
            xero_tenant_id: true,
          },
          where: {
            active_slot: 1,
            OR: [
              {
                id: {
                  in: control.resources.flatMap((r) =>
                    r.xeroTenantId ? [r.xeroTenantId] : []
                  ),
                },
              },
              { xero_credential_owner_id: { in: ownerIds } },
            ],
            retired_at: null,
          },
        });
        if (
          bindings.some(
            (binding) =>
              !control.resources.some(
                (resource) =>
                  resource.xeroTenantId === binding.id &&
                  resource.clerkOrgId === binding.clerk_org_id &&
                  resource.organisationId === binding.organisation_id &&
                  resource.bindingGeneration === binding.binding_generation &&
                  resource.externalTenantId === binding.xero_tenant_id &&
                  resource.credentialOwnerId ===
                    binding.xero_credential_owner_id
              )
          ) ||
          control.resources.some(
            (resource) =>
              resource.xeroTenantId !== null &&
              !bindings.some((binding) => binding.id === resource.xeroTenantId)
          )
        ) {
          throw new XeroCampaignDeniedError();
        }
        return this.initialiseReservedControl(control);
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
  }
  private async initialiseReservedControl(value: XeroCampaignControl) {
    const control = XeroCampaignControlSchema.parse(value);
    const current = await this.readOrganisation(
      control.resources[0]?.organisationId ?? ""
    );
    if (
      control.phase !== "acquiring" ||
      control.tickets.length ||
      control.credentialDomainId !== this.input.credentialDomainId ||
      control.databaseTargetHash !== current.sentinel.databaseTargetHash ||
      new Set(control.resources.map((r) => r.organisationId)).size !==
        control.resources.length
    ) {
      throw new XeroCampaignDeniedError();
    }
    const reservations = [
      this.keys.active,
      ...new Set(
        control.resources.flatMap((r) => [
          this.keys.organisation(r.organisationId),
          this.keys.provider(r.providerAppId, r.externalTenantId),
          this.keys.provider(r.providerAppId),
        ])
      ),
    ];
    const keys = [
      this.keys.sentinel,
      this.keys.control(control.runId),
      ...reservations,
    ];
    const result = await this.command([
      "EVAL",
      INITIALISE,
      String(keys.length),
      ...keys,
      control.runId,
      JSON.stringify(control),
      control.databaseRunId,
      this.keys.control(""),
      String(control.epoch),
    ]);
    if (result !== 1) {
      throw new XeroCampaignDeniedError();
    }
    return control;
  }
}
export async function initialiseXeroCampaignSentinel(
  value: XeroCampaignSentinel,
  input: XeroCampaignStoreInput
) {
  const store = new XeroCampaignStore(input);
  const sentinel = XeroCampaignSentinelSchema.parse(value);
  if (sentinel.credentialDomainId !== input.credentialDomainId) {
    throw new XeroCampaignDeniedError();
  }
  const result = await store.command([
    "SET",
    store.keys.sentinel,
    JSON.stringify(sentinel),
    "NX",
  ]);
  if (result !== "OK") {
    throw new XeroCampaignDeniedError();
  }
}

const NEWLINE = /[\r\n]/;
const TRAILING_SLASHES = /\/+$/;
