import { createHash, randomUUID } from "node:crypto";
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
    ordinaryInvocations: (id: string) => `${prefix}:ordinary-invocations:${id}`,
    ordinaryProviderAttempts: (app: string, tenant?: string) =>
      `${prefix}:ordinary-provider-attempts:${digest(JSON.stringify([app, tenant ?? null]))}`,
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
if redis.call('get', KEYS[1]) ~= ARGV[1] or redis.call('get', 'release:active-run') ~= ARGV[3] or redis.call('get', KEYS[2]) ~= ARGV[4] then return 0 end
redis.call('set', KEYS[1], ARGV[2])
return 1
`;
const INITIALISE = `
local sentinel = redis.call('get', KEYS[1])
if not sentinel or redis.call('get', 'release:active-run') ~= ARGV[3] then return 0 end
local identity = cjson.decode(sentinel)
if identity.version ~= 1 or identity.credentialDomainId ~= ARGV[7] or identity.databaseTargetHash ~= ARGV[8] then return 0 end
if redis.call('exists', KEYS[2]) ~= 0 then return 0 end
local reservationCount = tonumber(ARGV[6])
for i = 3, 2 + reservationCount do
  local previous = redis.call('get', KEYS[i])
  if previous then
    local raw = redis.call('get', ARGV[4] .. previous)
    if not raw then return 0 end
    local value = cjson.decode(raw)
    if value.phase ~= 'closed' or value.epoch >= tonumber(ARGV[5]) then return 0 end
  end
end
for i = 3 + reservationCount, #KEYS do
  if redis.call('hlen', KEYS[i]) ~= 0 then return 0 end
end
redis.call('set', KEYS[2], ARGV[2])
for i = 3, 2 + reservationCount do redis.call('set', KEYS[i], ARGV[1]) end
return 1
`;
const START_ORDINARY_PROVIDER_ATTEMPT = `
local sentinel = redis.call('get', KEYS[1])
if not sentinel then return 0 end
local identity = cjson.decode(sentinel)
if identity.version ~= 1 or identity.credentialDomainId ~= ARGV[2] or identity.databaseTargetHash ~= ARGV[3] then return 0 end
local previous = redis.call('get', KEYS[2])
if previous then
  local raw = redis.call('get', ARGV[4] .. previous)
  if not raw or cjson.decode(raw).phase ~= 'closed' then return 0 end
end
if redis.call('hlen', KEYS[3]) >= 2000 or redis.call('hexists', KEYS[3], ARGV[1]) ~= 0 then return 0 end
redis.call('hset', KEYS[3], ARGV[1], cjson.encode({state='dispatched', credentialDomainId=ARGV[2], databaseTargetHash=ARGV[3], providerAppId=ARGV[5], externalTenantId=ARGV[6]}))
return 1
`;
const FINISH_ORDINARY_PROVIDER_ATTEMPT = `
local sentinel = redis.call('get', KEYS[1])
if not sentinel then return 0 end
local identity = cjson.decode(sentinel)
if identity.version ~= 1 or identity.credentialDomainId ~= ARGV[3] or identity.databaseTargetHash ~= ARGV[4] then return 0 end
local raw = redis.call('hget', KEYS[2], ARGV[1])
if not raw then return 0 end
local attempt = cjson.decode(raw)
if attempt.state ~= 'dispatched' or attempt.credentialDomainId ~= ARGV[3] or attempt.databaseTargetHash ~= ARGV[4] or attempt.providerAppId ~= ARGV[5] or attempt.externalTenantId ~= ARGV[6] then return 0 end
if ARGV[2] == 'completed' then
  redis.call('hdel', KEYS[2], ARGV[1])
elseif ARGV[2] == 'uncertain' then
  attempt.state = 'uncertain'
  redis.call('hset', KEYS[2], ARGV[1], cjson.encode(attempt))
else
  return 0
end
return 1
`;
const START_ORDINARY_INVOCATION = `
local sentinel = redis.call('get', KEYS[1])
if sentinel ~= ARGV[2] then return 0 end
local prior = redis.call('get', KEYS[2])
if prior then
  local raw = redis.call('get', ARGV[3] .. prior)
  if not raw or cjson.decode(raw).phase ~= 'closed' then return 0 end
end
if redis.call('hlen', KEYS[3]) >= 2000 or redis.call('hexists', KEYS[3], ARGV[1]) ~= 0 then return 0 end
redis.call('hset', KEYS[3], ARGV[1], ARGV[4])
return 1
`;
const FINISH_ORDINARY_INVOCATION = `
if redis.call('get', KEYS[1]) ~= ARGV[2] then return 0 end
local invocation = redis.call('hget', KEYS[2], ARGV[1])
if invocation ~= ARGV[3] then return 0 end
if ARGV[4] == 'completed' then
  redis.call('hdel', KEYS[2], ARGV[1])
elseif ARGV[4] == 'uncertain' then
  local value = cjson.decode(invocation)
  value.state = 'uncertain'
  redis.call('hset', KEYS[2], ARGV[1], cjson.encode(value))
else return 0 end
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
  sentinelRaw: string;
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
        return { control: null, raw: null, sentinel, sentinelRaw };
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
      return { control, raw, sentinel, sentinelRaw };
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
  async beginOrdinaryInvocation(
    scope: {
      clerkOrgId: string;
      organisationId: string;
    },
    functionId = "xero.scoped-effect"
  ) {
    const snapshot = await this.readOrganisation(scope.organisationId);
    const id = randomUUID();
    const attempt = {
      id,
      organisationId: scope.organisationId,
      raw: JSON.stringify({
        ...scope,
        functionId: z.string().min(1).max(100).parse(functionId),
        id,
        runtimeRevision: this.input.runtimeRevision,
        startedAt: new Date().toISOString(),
        state: "running",
      }),
      sentinelRaw: snapshot.sentinelRaw,
    };
    const result = await this.command([
      "EVAL",
      START_ORDINARY_INVOCATION,
      "3",
      this.keys.sentinel,
      this.keys.organisation(scope.organisationId),
      this.keys.ordinaryInvocations(scope.organisationId),
      attempt.id,
      attempt.sentinelRaw,
      this.keys.control(""),
      attempt.raw,
    ]);
    if (result !== 1) {
      throw new XeroCampaignDeniedError();
    }
    return attempt;
  }
  async finishOrdinaryInvocation(
    attempt: {
      id: string;
      organisationId: string;
      raw: string;
      sentinelRaw: string;
    },
    outcome: "completed" | "uncertain"
  ) {
    const result = await this.command([
      "EVAL",
      FINISH_ORDINARY_INVOCATION,
      "2",
      this.keys.sentinel,
      this.keys.ordinaryInvocations(attempt.organisationId),
      attempt.id,
      attempt.sentinelRaw,
      attempt.raw,
      outcome,
    ]);
    if (result !== 1) {
      throw new XeroCampaignDeniedError();
    }
  }
  /** Register before dispatch; acquisition checks the same hash atomically. */
  async beginOrdinaryProviderAttempt(
    providerAppId: string,
    externalTenantId?: string
  ) {
    const snapshot = await this.snapshot(
      this.keys.provider(providerAppId, externalTenantId)
    );
    const id = randomUUID();
    const result = await this.command([
      "EVAL",
      START_ORDINARY_PROVIDER_ATTEMPT,
      "3",
      this.keys.sentinel,
      this.keys.provider(providerAppId, externalTenantId),
      this.keys.ordinaryProviderAttempts(providerAppId, externalTenantId),
      id,
      snapshot.sentinel.credentialDomainId,
      snapshot.sentinel.databaseTargetHash,
      this.keys.control(""),
      providerAppId,
      externalTenantId ?? "",
    ]);
    if (result !== 1) {
      throw new XeroCampaignDeniedError();
    }
    return {
      credentialDomainId: snapshot.sentinel.credentialDomainId,
      databaseTargetHash: snapshot.sentinel.databaseTargetHash,
      externalTenantId: externalTenantId ?? "",
      id,
      providerAppId,
    };
  }
  async finishOrdinaryProviderAttempt(
    attempt: {
      credentialDomainId: string;
      databaseTargetHash: string;
      externalTenantId: string;
      id: string;
      providerAppId: string;
    },
    outcome: "completed" | "uncertain"
  ) {
    const result = await this.command([
      "EVAL",
      FINISH_ORDINARY_PROVIDER_ATTEMPT,
      "2",
      this.keys.sentinel,
      this.keys.ordinaryProviderAttempts(
        attempt.providerAppId,
        attempt.externalTenantId || undefined
      ),
      attempt.id,
      outcome,
      attempt.credentialDomainId,
      attempt.databaseTargetHash,
      attempt.providerAppId,
      attempt.externalTenantId,
    ]);
    if (result !== 1) {
      throw new XeroCampaignDeniedError();
    }
  }
  compareAndSet(previous: XeroCampaignSnapshot, next: XeroCampaignControl) {
    return this.commitControl(previous, next);
  }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Preserve immutable ownership and all prior effect and ticket evidence at the single atomic write boundary.
  private async commitControl(
    previous: XeroCampaignSnapshot,
    next: XeroCampaignControl,
    bindingDispatchId?: string
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
      "bindingTransitions",
    ] as const) {
      if (
        (key === "resources" || key === "bindingTransitions") &&
        bindingDispatchId
      ) {
        continue;
      }
      if (JSON.stringify(parsed[key]) !== JSON.stringify(before[key])) {
        throw new XeroCampaignDeniedError();
      }
    }
    if (
      before.phase !== "active" &&
      parsed.effects.some(
        (effect) =>
          effect.providerDispatch === true &&
          !before.effects.some(
            (previousEffect) => previousEffect.id === effect.id
          )
      )
    ) {
      throw new XeroCampaignDeniedError();
    }
    for (const effect of before.effects) {
      const updated = parsed.effects.find((entry) => entry.id === effect.id);
      if (
        !updated ||
        updated.dispatchId !== effect.dispatchId ||
        updated.providerRequest !== effect.providerRequest ||
        updated.providerDispatch !== effect.providerDispatch ||
        (effect.outcome !== "dispatched" &&
          updated.providerResponseStatus !== effect.providerResponseStatus) ||
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
        if (
          key === "bindingGeneration" &&
          ticket.dispatchId === bindingDispatchId
        ) {
          continue;
        }
        if (updated[key] !== ticket[key]) {
          throw new XeroCampaignDeniedError();
        }
      }
      if (
        JSON.stringify(updated.providerRequests) !==
          JSON.stringify(ticket.providerRequests) ||
        (ticket.workerRunId !== null &&
          updated.workerRunId !== ticket.workerRunId) ||
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
      "2",
      this.keys.control(parsed.runId),
      this.keys.sentinel,
      previous.raw,
      JSON.stringify(parsed),
      parsed.databaseRunId,
      previous.sentinelRaw,
    ]);
    if (result !== 1) {
      throw new XeroCampaignDeniedError();
    }
    return parsed;
  }
  /** Only a post-commit scoped SQL read can advance an actor's intentional binding generation. */
  async reconcileActionBinding(
    input: {
      runId: string;
      epoch: number;
      dispatchId: string;
      userId: string;
      clerkOrgId: string;
      organisationId: string;
    },
    adopt: (resource: XeroCampaignControl["resources"][number]) => void
  ) {
    const { database, lockXeroCampaign } = await import("@repo/database");
    return database.$transaction(
      async (tx) => {
        await lockXeroCampaign(tx, this.input.credentialDomainId);
        const previous = await this.readOrganisation(input.organisationId);
        const { control } = previous;
        const ticket = control?.tickets.find(
          (entry) => entry.dispatchId === input.dispatchId
        );
        const resource = control?.resources.find(
          (entry) =>
            entry.organisationId === input.organisationId &&
            entry.clerkOrgId === input.clerkOrgId
        );
        if (
          !(control && ticket && resource) ||
          control.runId !== input.runId ||
          control.epoch !== input.epoch ||
          !["active", "draining"].includes(control.phase) ||
          control.candidateSha !== this.input.runtimeRevision ||
          Date.parse(control.expiresAt) <= Date.now() ||
          ticket.userId !== input.userId ||
          ticket.clerkOrgId !== input.clerkOrgId ||
          ticket.organisationId !== input.organisationId ||
          ticket.outcome !== "running" ||
          !ticket.targetHash ||
          !["xero.tenant-selection", "xero.disconnect"].includes(
            ticket.functionId
          )
        ) {
          throw new XeroCampaignDeniedError();
        }
        const rows = await tx.xeroTenant.findMany({
          select: {
            active_slot: true,
            binding_generation: true,
            id: true,
            provider_app_id: true,
            retired_at: true,
            retirement_reason: true,
            xero_credential_owner_id: true,
            xero_tenant_id: true,
          },
          where: {
            clerk_org_id: input.clerkOrgId,
            organisation_id: input.organisationId,
            ...(ticket.functionId === "xero.tenant-selection"
              ? { active_slot: 1, retired_at: null }
              : { id: resource.xeroTenantId ?? "" }),
          },
        });
        const [binding] = rows;
        if (
          rows.length !== 1 ||
          !binding ||
          binding.xero_tenant_id !== resource.externalTenantId ||
          binding.provider_app_id !== resource.providerAppId
        ) {
          throw new XeroCampaignDeniedError();
        }
        if (sameCampaignBinding(binding, resource)) {
          return resource;
        }
        if (
          binding.binding_generation !== resource.bindingGeneration + 1 ||
          !validCampaignBindingState(ticket.functionId, binding)
        ) {
          throw new XeroCampaignDeniedError();
        }
        await assertOwnedCredentialSharing(tx, binding, control);
        const nextResource: XeroCampaignControl["resources"][number] = {
          ...resource,
          bindingGeneration: binding.binding_generation,
          bindingState:
            binding.active_slot === 1 && binding.retired_at === null
              ? "active"
              : "retired",
          credentialOwnerId: binding.xero_credential_owner_id,
          xeroTenantId: binding.id,
        };
        await this.commitControl(
          previous,
          {
            ...control,
            bindingTransitions: [
              ...(control.bindingTransitions ?? []),
              {
                dispatchId: input.dispatchId,
                next: nextResource,
                observedAt: new Date().toISOString(),
                previous: resource,
              },
            ],
            resources: control.resources.map((entry) =>
              entry.organisationId === input.organisationId
                ? nextResource
                : entry
            ),
            tickets: control.tickets.map((entry) =>
              entry.dispatchId === input.dispatchId
                ? { ...entry, bindingGeneration: binding.binding_generation }
                : entry
            ),
          },
          input.dispatchId
        );
        adopt(nextResource);
        return nextResource;
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
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
      ...new Set(
        control.resources.flatMap((resource) => [
          this.keys.ordinaryInvocations(resource.organisationId),
          this.keys.ordinaryProviderAttempts(resource.providerAppId),
          this.keys.ordinaryProviderAttempts(
            resource.providerAppId,
            resource.externalTenantId
          ),
        ])
      ),
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
      String(reservations.length),
      control.credentialDomainId,
      control.databaseTargetHash,
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

async function assertOwnedCredentialSharing(
  tx: {
    xeroTenant: {
      findMany: (input: {
        select: { clerk_org_id: true; id: true; organisation_id: true };
        where: {
          active_slot: number;
          retired_at: null;
          xero_credential_owner_id: string;
        };
      }) => Promise<
        { clerk_org_id: string; id: string; organisation_id: string }[]
      >;
    };
  },
  binding: { id: string; xero_credential_owner_id: string | null },
  control: XeroCampaignControl
) {
  if (binding.xero_credential_owner_id) {
    const sharing = await tx.xeroTenant.findMany({
      select: { clerk_org_id: true, id: true, organisation_id: true },
      where: {
        active_slot: 1,
        retired_at: null,
        xero_credential_owner_id: binding.xero_credential_owner_id,
      },
    });
    if (
      sharing.some(
        (shared) =>
          shared.id !== binding.id &&
          !control.resources.some(
            (owned) =>
              owned.xeroTenantId === shared.id &&
              owned.clerkOrgId === shared.clerk_org_id &&
              owned.organisationId === shared.organisation_id
          )
      )
    ) {
      throw new XeroCampaignDeniedError();
    }
  }
}

function sameCampaignBinding(
  binding: {
    binding_generation: number;
    id: string;
    xero_credential_owner_id: string | null;
    active_slot: number | null;
    retired_at: Date | null;
    retirement_reason: string | null;
  },
  resource: XeroCampaignControl["resources"][number]
) {
  return (
    binding.binding_generation === resource.bindingGeneration &&
    binding.id === resource.xeroTenantId &&
    binding.xero_credential_owner_id === resource.credentialOwnerId &&
    campaignBindingState(binding) === (resource.bindingState ?? "active")
  );
}

function campaignBindingState(binding: {
  active_slot: number | null;
  retired_at: Date | null;
  retirement_reason: string | null;
}): "active" | "retired" | null {
  if (binding.active_slot === 1 && binding.retired_at === null) {
    return "active";
  }
  if (
    binding.active_slot === null &&
    binding.retired_at instanceof Date &&
    Number.isFinite(binding.retired_at.getTime()) &&
    binding.retirement_reason === "disconnected"
  ) {
    return "retired";
  }
  return null;
}
function validCampaignBindingState(
  functionId: string,
  binding: {
    active_slot: number | null;
    retired_at: Date | null;
    retirement_reason: string | null;
  }
) {
  const state = campaignBindingState(binding);
  return (
    state !== null &&
    (functionId !== "xero.tenant-selection" || state === "active")
  );
}
