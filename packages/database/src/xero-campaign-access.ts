import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@repo/database/generated/client";
import { z } from "zod";
import { withDatabaseWriteGuard } from "./write-guard";
import {
  type XeroCampaignControl,
  XeroCampaignDeniedError,
  type XeroCampaignEvent,
  XeroCampaignEventSchema,
  type XeroCampaignProviderRequest,
  type XeroCampaignScope,
  XeroCampaignScopeSchema,
  type XeroCampaignTicket,
  xeroCampaignActionTargetHash,
} from "./xero-campaign-contract";
import {
  type XeroCampaignSnapshot,
  XeroCampaignStore,
  type XeroCampaignStoreInput,
} from "./xero-campaign-store";

interface Invocation {
  campaign: XeroCampaignEvent;
  functionId: string;
  scope: XeroCampaignScope;
  store: XeroCampaignStore;
}
const RECONNECT_ACTIONS = new Set([
  "xero.oauth.start",
  "xero.oauth.callback",
  "xero.tenant-selection",
]);
const invocations = new AsyncLocalStorage<Invocation>();
const inlineChildren = new AsyncLocalStorage<{
  dispatchId: string;
  functionId: string;
}>();
const actions = new AsyncLocalStorage<{
  campaign: XeroCampaignEvent;
  functionId: string;
  targetHash: string;
  userId: string;
}>();
type OrdinaryScope = Pick<XeroCampaignScope, "clerkOrgId" | "organisationId"> &
  Partial<XeroCampaignScope>;
const ordinaryScopes = new AsyncLocalStorage<{
  active: boolean;
  pending: Set<Promise<unknown>>;
  acceptedMutation: boolean;
  scope: OrdinaryScope;
  store: XeroCampaignStore;
}>();
const transactions = new AsyncLocalStorage<Prisma.TransactionClient>();
const observations = new AsyncLocalStorage<{
  input: XeroCampaignAuthorityInput;
  store: XeroCampaignStore;
}>();
const credentials = new AsyncLocalStorage<{
  scope: XeroCampaignScope;
  externalTenantId: string;
  store: XeroCampaignStore;
}>();
export function currentXeroCampaignInvocation() {
  return invocations.getStore();
}
export interface XeroCampaignAuthorityInput extends XeroCampaignScope {
  candidateSha: string;
  epoch: number;
  externalTenantId?: string;
  functionId?: string;
  phases?: readonly XeroCampaignControl["phase"][];
  runId: string;
}
function assertSnapshot(
  snapshot: XeroCampaignSnapshot,
  input: XeroCampaignAuthorityInput,
  store: XeroCampaignStore
): XeroCampaignControl {
  const { control } = snapshot;
  const now = Date.now();
  if (
    !control ||
    control.runId !== input.runId ||
    control.epoch !== input.epoch ||
    control.candidateSha !== input.candidateSha ||
    control.candidateSha !== store.input.runtimeRevision ||
    !(input.phases ?? ["active"]).includes(control.phase) ||
    Date.parse(control.expiresAt) <= now ||
    Date.parse(control.registrationObservedAt) > now + 30_000 ||
    now - Date.parse(control.registrationObservedAt) > 15 * 60_000 ||
    (input.functionId && !control.allowedFunctions.includes(input.functionId))
  ) {
    throw new XeroCampaignDeniedError();
  }
  const resource = control.resources.find(
    (r) => r.organisationId === input.organisationId
  );
  if (
    !resource ||
    resource.clerkOrgId !== input.clerkOrgId ||
    resource.bindingGeneration !== input.bindingGeneration ||
    (input.xeroTenantId !== undefined &&
      resource.xeroTenantId !== input.xeroTenantId) ||
    (input.externalTenantId !== undefined &&
      resource.externalTenantId !== input.externalTenantId)
  ) {
    throw new XeroCampaignDeniedError();
  }
  return control;
}
export async function assertXeroCampaignAuthority(
  input: XeroCampaignAuthorityInput,
  configuration?: XeroCampaignStoreInput
) {
  const store = new XeroCampaignStore(configuration);
  return assertSnapshot(
    await store.readOrganisation(input.organisationId),
    input,
    store
  );
}
async function admission(
  scope: XeroCampaignScope,
  functionId: string,
  campaign?: XeroCampaignEvent,
  store = new XeroCampaignStore()
) {
  const snapshot = await store.readOrganisation(scope.organisationId);
  if (!snapshot.control || snapshot.control.phase === "closed") {
    if (campaign) {
      throw new XeroCampaignDeniedError();
    }
    return { snapshot, store };
  }
  if (!campaign) {
    throw new XeroCampaignDeniedError();
  }
  const current = invocations.getStore();
  const continuing =
    current?.store === store &&
    current.functionId === functionId &&
    current.campaign.runId === campaign.runId &&
    current.campaign.epoch === campaign.epoch &&
    current.campaign.dispatchId === campaign.dispatchId &&
    snapshot.control.tickets.some(
      (entry) =>
        entry.dispatchId === campaign.dispatchId && entry.outcome === "running"
    );
  const control = assertSnapshot(
    snapshot,
    {
      ...scope,
      ...campaign,
      candidateSha: store.input.runtimeRevision,
      functionId,
      phases: continuing ? ["active", "draining"] : ["active"],
    },
    store
  );
  const ticket = control.tickets.find(
    (t) => t.dispatchId === campaign.dispatchId
  );
  if (
    !ticket ||
    ticket.functionId !== functionId ||
    ticket.clerkOrgId !== scope.clerkOrgId ||
    ticket.organisationId !== scope.organisationId ||
    ticket.bindingGeneration !== scope.bindingGeneration
  ) {
    throw new XeroCampaignDeniedError();
  }
  const resource = control.resources.find(
    (entry) => entry.organisationId === scope.organisationId
  );
  if (
    resource?.bindingState === "retired" &&
    (ticket.userId === null ||
      !(
        RECONNECT_ACTIONS.has(functionId) ||
        (functionId === "xero.disconnect" &&
          ticket.outcome === "running" &&
          invocations.getStore()?.campaign.dispatchId === ticket.dispatchId &&
          control.bindingTransitions?.some(
            (transition) =>
              transition.dispatchId === ticket.dispatchId &&
              transition.next.bindingState === "retired"
          ))
      ))
  ) {
    throw new XeroCampaignDeniedError();
  }
  return { snapshot, store, ticket };
}
function assertSameScope(expected: OrdinaryScope, actual: XeroCampaignScope) {
  if (
    expected.clerkOrgId !== actual.clerkOrgId ||
    expected.organisationId !== actual.organisationId ||
    (expected.bindingGeneration !== undefined &&
      expected.bindingGeneration !== actual.bindingGeneration) ||
    (expected.xeroTenantId !== undefined &&
      expected.xeroTenantId !== actual.xeroTenantId)
  ) {
    throw new XeroCampaignDeniedError();
  }
}
export async function assertXeroCampaignAccess(scope: XeroCampaignScope) {
  const observer = observations.getStore();
  if (observer) {
    assertSameScope(observer.input, scope);
    const snapshot = await observer.store.readOrganisation(
      observer.input.organisationId
    );
    assertSnapshot(snapshot, observer.input, observer.store);
    return { snapshot, store: observer.store, ticket: undefined };
  }
  const current = invocations.getStore();
  const scoped = current ?? credentials.getStore() ?? ordinaryScopes.getStore();
  if (scoped) {
    assertSameScope(scoped.scope, scope);
  }
  const result = await admission(
    scope,
    current?.functionId ?? "ordinary",
    current?.campaign,
    scoped?.store
  );
  if (result.ticket && result.ticket.outcome !== "running") {
    throw new XeroCampaignDeniedError();
  }
  return result;
}
export async function assertXeroCampaignDispatch(
  scope: XeroCampaignScope,
  functionId: string,
  event?: XeroCampaignEvent
) {
  const result = await admission(scope, functionId, event);
  if (result.ticket && result.ticket.outcome !== "reserved") {
    throw new XeroCampaignDeniedError();
  }
  return result;
}
export async function reserveXeroCampaignTicket(
  input: XeroCampaignAuthorityInput,
  ticket: Omit<
    XeroCampaignTicket,
    "outcome" | "eventIds" | "workerRunId" | "providerRequests"
  > & { providerRequests?: XeroCampaignProviderRequest[] },
  configuration?: XeroCampaignStoreInput
) {
  const store = new XeroCampaignStore(configuration);
  const snapshot = await store.readOrganisation(input.organisationId);
  const control = assertSnapshot(
    snapshot,
    { ...input, functionId: ticket.functionId },
    store
  );
  if (
    ticket.organisationId !== input.organisationId ||
    ticket.clerkOrgId !== input.clerkOrgId ||
    ticket.bindingGeneration !== input.bindingGeneration ||
    control.tickets.some(
      (t) =>
        t.dispatchId === ticket.dispatchId ||
        (ticket.scheduledSlot !== null &&
          t.scheduledSlot === ticket.scheduledSlot &&
          t.organisationId === ticket.organisationId &&
          t.functionId === ticket.functionId)
    )
  ) {
    throw new XeroCampaignDeniedError();
  }
  if (
    ticket.userId !== null &&
    !(
      ticket.targetHash &&
      control.sanctionedActors.some(
        (a) =>
          a.userId === ticket.userId &&
          a.clerkOrgId === ticket.clerkOrgId &&
          a.organisationId === ticket.organisationId &&
          a.actions.includes(ticket.functionId)
      )
    )
  ) {
    throw new XeroCampaignDeniedError();
  }
  await store.compareAndSet(snapshot, {
    ...control,
    tickets: [
      ...control.tickets,
      {
        ...ticket,
        eventIds: [],
        outcome: "reserved",
        providerRequests: ticket.providerRequests ?? [],
        workerRunId: null,
      },
    ],
  });
  return {
    dispatchId: ticket.dispatchId,
    epoch: control.epoch,
    runId: control.runId,
  };
}
export async function recordXeroCampaignDispatch(
  scope: XeroCampaignScope,
  functionId: string,
  campaign: XeroCampaignEvent | undefined,
  eventIds: string[]
) {
  if (!campaign) {
    return;
  }
  const { snapshot, store, ticket } = await admission(
    scope,
    functionId,
    campaign
  );
  if (!(snapshot.control && ticket) || ticket.eventIds.length) {
    throw new XeroCampaignDeniedError();
  }
  await store.compareAndSet(snapshot, {
    ...snapshot.control,
    tickets: snapshot.control.tickets.map((t) =>
      t.dispatchId === ticket.dispatchId ? { ...t, eventIds } : t
    ),
  });
}
const invocationInput = XeroCampaignScopeSchema.extend({
  campaign: XeroCampaignEventSchema.optional(),
});
async function withOrdinaryInvocation<T>(
  scope: OrdinaryScope,
  store: XeroCampaignStore,
  operation: () => Promise<T>,
  functionId = "xero.scoped-effect"
): Promise<T> {
  const inherited = ordinaryScopes.getStore();
  if (inherited) {
    if (
      !inherited.active ||
      inherited.scope.clerkOrgId !== scope.clerkOrgId ||
      inherited.scope.organisationId !== scope.organisationId
    ) {
      throw new XeroCampaignDeniedError();
    }
    const pending = Promise.resolve().then(operation);
    inherited.pending.add(pending);
    const settled = () => inherited.pending.delete(pending);
    pending.then(settled, settled);
    return pending;
  }
  const attempt = await store.beginOrdinaryInvocation(scope, functionId);
  const context = {
    acceptedMutation: false,
    active: true,
    pending: new Set<Promise<unknown>>(),
    scope,
    store,
  };
  let outcome: "completed" | "uncertain" = "uncertain";
  let result: T;
  let unfinished: Promise<unknown>[] = [];
  try {
    result = await ordinaryScopes.run(context, operation);
    outcome = ordinaryResultIsUncertain(context, result)
      ? "uncertain"
      : "completed";
  } finally {
    context.active = false;
    unfinished = [...context.pending];
    await Promise.allSettled(unfinished);
    if (unfinished.length) {
      outcome = "uncertain";
    }
    await store.finishOrdinaryInvocation(attempt, outcome);
  }
  if (unfinished.length) {
    throw new XeroCampaignDeniedError();
  }
  return result;
}
export async function withXeroCampaignInvocation<T>(
  functionId: string,
  value: unknown,
  operation: () => Promise<T>,
  workerRunId: string | null = null,
  configuration?: XeroCampaignStoreInput
): Promise<T> {
  const parsed = invocationInput.safeParse(value);
  if (!parsed.success) {
    throw new XeroCampaignDeniedError();
  }
  const { campaign, ...scope } = parsed.data;
  const store = new XeroCampaignStore(configuration);
  const admitted = await admission(scope, functionId, campaign, store);
  const guardedOperation = () =>
    withDatabaseWriteGuard(
      (tx) =>
        lockXeroCampaignPersistence(invocations.getStore()?.scope ?? scope, tx),
      operation
    );
  if (!(campaign && admitted.snapshot.control && admitted.ticket)) {
    return withOrdinaryInvocation(scope, store, guardedOperation, functionId);
  }
  const action = actions.getStore();
  if (
    admitted.ticket.userId !== null &&
    (!action ||
      action.campaign.dispatchId !== campaign.dispatchId ||
      action.campaign.runId !== campaign.runId ||
      action.campaign.epoch !== campaign.epoch ||
      action.functionId !== functionId ||
      action.userId !== admitted.ticket.userId ||
      action.targetHash !== admitted.ticket.targetHash)
  ) {
    throw new XeroCampaignDeniedError();
  }
  if (!["reserved", "failed"].includes(admitted.ticket.outcome)) {
    throw new XeroCampaignDeniedError();
  }
  await store.compareAndSet(admitted.snapshot, {
    ...admitted.snapshot.control,
    tickets: admitted.snapshot.control.tickets.map((t) =>
      t.dispatchId === campaign.dispatchId
        ? { ...t, outcome: "running", workerRunId }
        : t
    ),
  });
  let outcome: "succeeded" | "failed" = "failed";
  try {
    const result = await invocations.run(
      { campaign, functionId, scope, store },
      inlineChildren.getStore()?.dispatchId === campaign.dispatchId &&
        inlineChildren.getStore()?.functionId === functionId
        ? operation
        : guardedOperation
    );
    outcome =
      result &&
      typeof result === "object" &&
      Reflect.get(result, "ok") === false
        ? "failed"
        : "succeeded";
    return result;
  } finally {
    const snapshot = await store.readOrganisation(scope.organisationId);
    if (
      !snapshot.control ||
      snapshot.control.runId !== campaign.runId ||
      snapshot.control.epoch !== campaign.epoch
    ) {
      // biome-ignore lint/correctness/noUnsafeFinally: Losing durable completion evidence must invalidate the operation result.
      throw new XeroCampaignDeniedError();
    }
    await store.compareAndSet(snapshot, {
      ...snapshot.control,
      tickets: snapshot.control.tickets.map((t) =>
        t.dispatchId === campaign.dispatchId ? { ...t, outcome } : t
      ),
    });
  }
}
export async function lockXeroCampaignPersistence(
  scope: XeroCampaignScope,
  tx: Prisma.TransactionClient
) {
  const store =
    invocations.getStore()?.store ??
    credentials.getStore()?.store ??
    ordinaryScopes.getStore()?.store ??
    new XeroCampaignStore();
  // The lock also covers non-reserved work so initial acquisition cannot race a commit.
  const { lockXeroCampaign } = await import("@repo/database");
  await lockXeroCampaign(tx, store.input.credentialDomainId);
  await assertXeroCampaignAccess(scope);
}
export async function withXeroCampaignWrite<T>(
  scope: XeroCampaignScope,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const current = transactions.getStore();
  if (current) {
    await assertXeroCampaignAccess(scope);
    return operation(current);
  }
  const { database } = await import("@repo/database");
  return database.$transaction(
    async (tx) => {
      await lockXeroCampaignPersistence(scope, tx);
      const result = await transactions.run(tx, () => operation(tx));
      await assertXeroCampaignAccess(scope);
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 }
  );
}
export async function withXeroCampaignEffect<T>(
  scope: XeroCampaignScope,
  effect: () => Promise<T>
) {
  await assertXeroCampaignAccess(scope);
  return trackCampaignEffect(effect);
}
export function initialiseXeroCampaign(
  control: XeroCampaignControl,
  configuration?: XeroCampaignStoreInput
) {
  return new XeroCampaignStore(configuration).initialise(control);
}

export async function transitionXeroCampaign(
  runId: string,
  epoch: number,
  phase: XeroCampaignControl["phase"],
  configuration?: XeroCampaignStoreInput
) {
  const store = new XeroCampaignStore(configuration);
  const { database, lockXeroCampaign } = await import("@repo/database");
  return database.$transaction(
    async (tx) => {
      await lockXeroCampaign(tx, store.input.credentialDomainId);
      const snapshot = await store.readRun(runId);
      const { control } = snapshot;
      if (!control || control.epoch !== epoch) {
        throw new XeroCampaignDeniedError();
      }
      const transitions: Record<
        XeroCampaignControl["phase"],
        readonly XeroCampaignControl["phase"][]
      > = {
        acquiring: ["active", "draining", "recovering"],
        active: ["draining"],
        closed: [],
        draining: ["recovering", "closed"],
        recovering: ["draining", "closed"],
      };
      if (phase === "active") {
        for (const resource of control.resources) {
          assertSnapshot(
            snapshot,
            {
              ...resource,
              candidateSha: store.input.runtimeRevision,
              epoch,
              phases: ["acquiring"],
              runId,
            },
            store
          );
        }
      }
      if (
        !transitions[control.phase].includes(phase) ||
        (phase === "closed" &&
          (!control.closure ||
            control.effects.some((effect) => effect.outcome !== "completed") ||
            control.tickets.some(
              (t) => t.outcome === "running" || t.outcome === "reserved"
            )))
      ) {
        throw new XeroCampaignDeniedError();
      }
      return store.compareAndSet(snapshot, { ...control, phase });
    },
    { maxWait: 10_000, timeout: 30_000 }
  );
}
interface ProviderTarget {
  bodyHash?: string | null;
  kind: string;
  method?: string;
  providerAppId: string;
  tenantHeader?: string | null;
  tokenGrantType?: string | null;
  url?: string;
  xeroTenantId?: string;
}
function assertProviderTarget(target: ProviderTarget) {
  if (!target.url) {
    throw new XeroCampaignDeniedError();
  }
  const url = new URL(target.url);
  if (url.username || url.password || url.hash || url.href !== target.url) {
    throw new XeroCampaignDeniedError();
  }
  if (target.kind === "tenant") {
    if (
      url.origin !== "https://api.xero.com" ||
      !isCampaignPayrollRead(url, target.method ?? "GET") ||
      target.tenantHeader !== target.xeroTenantId
    ) {
      throw new XeroCampaignDeniedError();
    }
  } else if (target.kind === "token") {
    if (
      url.href !== "https://identity.xero.com/connect/token" ||
      target.method !== "POST"
    ) {
      throw new XeroCampaignDeniedError();
    }
  } else {
    // Campaign connection-management authority requires a separate exact connection ticket.
    throw new XeroCampaignDeniedError();
  }
}
function campaignProviderRequest(
  target: ProviderTarget,
  control: XeroCampaignControl | null,
  ticket: XeroCampaignTicket | undefined
): string | null {
  const action = actions.getStore();
  if (!action) {
    assertProviderTarget(target);
    return null;
  }
  if (
    !(control && ticket) ||
    ticket.userId !== action.userId ||
    ticket.targetHash !== action.targetHash ||
    !target.url
  ) {
    throw new XeroCampaignDeniedError();
  }
  const url = new URL(target.url);
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.href !== target.url ||
    !["https://api.xero.com", "https://identity.xero.com"].includes(url.origin)
  ) {
    throw new XeroCampaignDeniedError();
  }
  if (target.kind === "tenant" && target.tenantHeader !== target.xeroTenantId) {
    throw new XeroCampaignDeniedError();
  }
  if (
    (target.method ?? "GET") === "GET" &&
    target.kind === "tenant" &&
    isCampaignPayrollRead(url, "GET")
  ) {
    return null;
  }
  if (
    target.kind === "token" &&
    target.url === "https://identity.xero.com/connect/token"
  ) {
    assertProviderTarget(target);
    if (target.tokenGrantType === "refresh_token") {
      return null;
    }
    if (
      action.functionId !== "xero.oauth.callback" ||
      target.tokenGrantType !== "authorization_code"
    ) {
      throw new XeroCampaignDeniedError();
    }
    if (
      control.effects.some(
        (effect) =>
          effect.dispatchId === action.campaign.dispatchId &&
          effect.providerRequest === "oauth-code"
      )
    ) {
      throw new XeroCampaignDeniedError();
    }
    return "oauth-code";
  }
  return exactCampaignProviderGrant(target, control, ticket, action);
}
function exactCampaignProviderGrant(
  target: ProviderTarget,
  control: XeroCampaignControl,
  ticket: XeroCampaignTicket,
  action: { functionId: string; campaign: XeroCampaignEvent }
): string {
  const grants = ticket.providerRequests ?? [];
  const index = grants.findIndex(
    (request) =>
      request.url === target.url &&
      request.method === (target.method ?? "GET") &&
      request.bodyHash === target.bodyHash
  );
  const grant = grants[index];
  if (
    !grant ||
    (target.kind === "app_management" &&
      action.functionId !== "xero.disconnect")
  ) {
    throw new XeroCampaignDeniedError();
  }
  const identity = `request:${index}`;
  const prior = control.effects.filter(
    (effect) =>
      effect.dispatchId === action.campaign.dispatchId &&
      effect.providerRequest === identity
  );
  if (
    prior.length >= grant.maxAttempts ||
    prior.some(
      (effect) =>
        effect.outcome !== "completed" ||
        (grant.method !== "GET" &&
          ![401, 429].includes(effect.providerResponseStatus ?? 0))
    )
  ) {
    throw new XeroCampaignDeniedError();
  }
  return identity;
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Match exact observer, worker or ordinary credential authority to the same provider target.
export async function assertXeroCampaignProviderAccess(
  rateClass: ProviderTarget
) {
  const observer = observations.getStore();
  if (observer) {
    assertProviderTarget(rateClass);
    if ((rateClass.method ?? "GET") !== "GET" || rateClass.kind !== "tenant") {
      throw new XeroCampaignDeniedError();
    }
    const control = assertSnapshot(
      await observer.store.readOrganisation(observer.input.organisationId),
      observer.input,
      observer.store
    );
    const resource = control.resources.find(
      (r) => r.organisationId === observer.input.organisationId
    );
    if (
      !resource ||
      resource.externalTenantId !== rateClass.xeroTenantId ||
      resource.providerAppId !== rateClass.providerAppId
    ) {
      throw new XeroCampaignDeniedError();
    }
    return;
  }
  const invocation = invocations.getStore();
  const credential = credentials.getStore();
  const store =
    invocation?.store ?? credential?.store ?? new XeroCampaignStore();
  if (invocation) {
    const current = await assertXeroCampaignAccess(invocation.scope);
    campaignProviderRequest(
      rateClass,
      current.snapshot.control,
      current.ticket
    );
    const resource = current.snapshot.control?.resources.find(
      (entry) => entry.organisationId === invocation.scope.organisationId
    );
    if (
      !resource ||
      resource.providerAppId !== rateClass.providerAppId ||
      (rateClass.kind === "tenant" &&
        resource.externalTenantId !== rateClass.xeroTenantId)
    ) {
      throw new XeroCampaignDeniedError();
    }
  }
  const snapshot = await store.snapshot(
    store.keys.provider(
      rateClass.providerAppId,
      rateClass.kind === "tenant" ? rateClass.xeroTenantId : undefined
    )
  );
  if (!snapshot.control || snapshot.control.phase === "closed") {
    if (invocation) {
      await assertXeroCampaignAccess(invocation.scope);
    }
    return;
  }
  if (!invocation) {
    if (
      !credential ||
      (rateClass.kind === "tenant" &&
        credential.externalTenantId !== rateClass.xeroTenantId)
    ) {
      throw new XeroCampaignDeniedError();
    }
    // Campaign initialisation verifies that every live binding of reserved owners is included.
    const ordinary = await store.readOrganisation(
      credential.scope.organisationId
    );
    if (ordinary.control && ordinary.control.phase !== "closed") {
      throw new XeroCampaignDeniedError();
    }
    return;
  }
  const control = await assertXeroCampaignAccess(invocation.scope);
  if (
    control.snapshot.control?.runId !== snapshot.control.runId ||
    !snapshot.control.resources.some(
      (r) =>
        r.clerkOrgId === invocation.scope.clerkOrgId &&
        r.organisationId === invocation.scope.organisationId &&
        r.providerAppId === rateClass.providerAppId &&
        (rateClass.kind !== "tenant" ||
          r.externalTenantId === rateClass.xeroTenantId)
    )
  ) {
    throw new XeroCampaignDeniedError();
  }
}

/** A timed-out HTTP attempt remains uncertain and prevents terminal fence release. */
export async function withXeroCampaignProviderEffect<T>(
  rateClass: ProviderTarget,
  operation: () => Promise<T>
): Promise<T> {
  if (ordinaryScopes.getStore()?.active === false) {
    throw new XeroCampaignDeniedError();
  }
  await assertXeroCampaignProviderAccess(rateClass);
  if (invocations.getStore() || observations.getStore()) {
    return trackCampaignEffect(operation, rateClass);
  }
  const store =
    credentials.getStore()?.store ??
    ordinaryScopes.getStore()?.store ??
    new XeroCampaignStore();
  const attempt = await store.beginOrdinaryProviderAttempt(
    rateClass.providerAppId,
    rateClass.kind === "tenant" ? rateClass.xeroTenantId : undefined
  );
  let outcome: "completed" | "uncertain" = "uncertain";
  try {
    const result = await operation();
    const ordinary = ordinaryScopes.getStore();
    if (
      ordinary &&
      (rateClass.method ?? "GET") !== "GET" &&
      result instanceof Response &&
      result.status >= 200 &&
      result.status < 300
    ) {
      ordinary.acceptedMutation = true;
    }
    outcome =
      result instanceof Response &&
      (rateClass.method ?? "GET") !== "GET" &&
      result.status >= 500
        ? "uncertain"
        : "completed";
    return result;
  } finally {
    await store.finishOrdinaryProviderAttempt(attempt, outcome);
  }
}
async function trackCampaignEffect<T>(
  operation: () => Promise<T>,
  providerTarget?: ProviderTarget
): Promise<T> {
  const invocation = invocations.getStore();
  if (!invocation) {
    return operation();
  }
  const { snapshot, store, ticket } = await assertXeroCampaignAccess(
    invocation.scope
  );
  if (!snapshot.control) {
    throw new XeroCampaignDeniedError();
  }
  const providerRequest = providerTarget
    ? campaignProviderRequest(providerTarget, snapshot.control, ticket)
    : null;
  const id = randomUUID();
  await store.compareAndSet(snapshot, {
    ...snapshot.control,
    effects: [
      ...snapshot.control.effects,
      {
        dispatchId: invocation.campaign.dispatchId,
        id,
        outcome: "dispatched",
        providerDispatch: providerTarget !== undefined,
        providerRequest,
      },
    ],
  });
  let outcome: "completed" | "uncertain" = "uncertain";
  let providerResponseStatus: number | null = null;
  try {
    const result = await operation();
    providerResponseStatus =
      providerTarget && result instanceof Response ? result.status : null;
    outcome =
      result instanceof Response &&
      providerTarget &&
      (providerTarget.method ?? "GET") !== "GET" &&
      result.status >= 500
        ? "uncertain"
        : "completed";
    return result;
  } finally {
    const latest = await store.readOrganisation(
      invocation.scope.organisationId
    );
    if (
      !latest.control ||
      latest.control.runId !== invocation.campaign.runId ||
      latest.control.epoch !== invocation.campaign.epoch
    ) {
      // biome-ignore lint/correctness/noUnsafeFinally: An unrecorded provider outcome cannot be reported as safely completed.
      throw new XeroCampaignDeniedError();
    }
    await store.compareAndSet(latest, {
      ...latest.control,
      effects: latest.control.effects.map((entry) =>
        entry.id === id ? { ...entry, outcome, providerResponseStatus } : entry
      ),
    });
  }
}

export async function claimXeroCampaignScheduledDispatch(
  scope: XeroCampaignScope,
  functionId: string,
  scheduledSlot: string,
  schedulerRunId: string | undefined
): Promise<XeroCampaignEvent | undefined> {
  const store = new XeroCampaignStore();
  const snapshot = await store.readOrganisation(scope.organisationId);
  if (!snapshot.control || snapshot.control.phase === "closed") {
    return undefined;
  }
  const control = assertSnapshot(
    snapshot,
    {
      ...scope,
      candidateSha: store.input.runtimeRevision,
      epoch: snapshot.control.epoch,
      functionId,
      runId: snapshot.control.runId,
    },
    store
  );
  if (!schedulerRunId) {
    throw new XeroCampaignDeniedError();
  }
  const ticket = control.tickets.find(
    (entry) =>
      entry.clerkOrgId === scope.clerkOrgId &&
      entry.organisationId === scope.organisationId &&
      entry.bindingGeneration === scope.bindingGeneration &&
      entry.functionId === functionId &&
      entry.scheduledSlot === scheduledSlot &&
      entry.schedulerRunId === null &&
      entry.userId === null &&
      entry.outcome === "reserved" &&
      entry.eventIds.length === 0
  );
  if (!ticket) {
    throw new XeroCampaignDeniedError();
  }
  await store.compareAndSet(snapshot, {
    ...control,
    tickets: control.tickets.map((entry) =>
      entry.dispatchId === ticket.dispatchId
        ? { ...entry, schedulerRunId }
        : entry
    ),
  });
  return {
    dispatchId: ticket.dispatchId,
    epoch: control.epoch,
    runId: control.runId,
  };
}
export async function xeroCampaignAllowsOrdinaryMaintenance(scope?: {
  clerkOrgId: string;
  organisationId: string;
}) {
  const store = new XeroCampaignStore();
  if (scope) {
    const snapshot = await store.readOrganisation(scope.organisationId);
    return !snapshot.control || snapshot.control.phase === "closed";
  }
  const snapshot = await store.snapshot(store.keys.active);
  return !snapshot.control || snapshot.control.phase === "closed";
}

export async function withXeroCampaignObservation<T>(
  input: XeroCampaignAuthorityInput,
  operation: () => Promise<T>,
  configuration?: XeroCampaignStoreInput
) {
  if (
    invocations.getStore() ||
    observations.getStore() ||
    credentials.getStore()
  ) {
    throw new XeroCampaignDeniedError();
  }
  const store = new XeroCampaignStore(configuration);
  assertSnapshot(
    await store.readOrganisation(input.organisationId),
    input,
    store
  );
  return observations.run({ input, store }, () =>
    withDatabaseWriteGuard(
      () => Promise.reject(new XeroCampaignDeniedError()),
      operation
    )
  );
}
export async function withXeroCampaignCredentialScope<T>(
  scope: XeroCampaignScope,
  externalTenantId: string,
  operation: () => Promise<T>
) {
  await assertXeroCampaignAccess(scope);
  const observer = observations.getStore();
  const credential = credentials.getStore();
  if (observer && observer.input.externalTenantId !== externalTenantId) {
    throw new XeroCampaignDeniedError();
  }
  if (credential && credential.externalTenantId !== externalTenantId) {
    throw new XeroCampaignDeniedError();
  }
  if (invocations.getStore() || observer || credential) {
    return operation();
  }
  const ordinary = ordinaryScopes.getStore();
  const store = ordinary?.store ?? new XeroCampaignStore();
  if (ordinary) {
    return credentials.run({ externalTenantId, scope, store }, operation);
  }
  return withOrdinaryInvocation(scope, store, () =>
    credentials.run({ externalTenantId, scope, store }, () =>
      withDatabaseWriteGuard(
        (tx) => lockXeroCampaignPersistence(scope, tx),
        operation
      )
    )
  );
}

const scopedInputSchema = z.object({
  bindingGeneration: z.number().int().nonnegative().optional(),
  campaign: XeroCampaignEventSchema.optional(),
  clerkOrgId: z.string().min(1),
  organisationId: z.uuid(),
  xeroTenantId: z.uuid().optional(),
});
export async function withXeroCampaignScopedInvocation<T>(
  functionId: string,
  input: unknown,
  operation: () => Promise<T>,
  workerRunId: string | null = null
) {
  const scope = scopedInputSchema.parse(input);
  const store = new XeroCampaignStore();
  const snapshot = await store.readOrganisation(scope.organisationId);
  if (snapshot.control && snapshot.control.phase !== "closed") {
    return withXeroCampaignInvocation(
      functionId,
      input,
      operation,
      workerRunId
    );
  }
  if (scope.campaign) {
    throw new XeroCampaignDeniedError();
  }
  return withOrdinaryInvocation(
    scope,
    store,
    () =>
      withDatabaseWriteGuard(async (tx) => {
        const { lockXeroCampaign } = await import("@repo/database");
        await lockXeroCampaign(tx, store.input.credentialDomainId);
        const latest = await store.readOrganisation(scope.organisationId);
        if (latest.control && latest.control.phase !== "closed") {
          throw new XeroCampaignDeniedError();
        }
      }, operation),
    functionId
  );
}
export async function dispatchXeroCampaignChild(
  functionId: string,
  data: { clerkOrgId: string; organisationId: string; [key: string]: unknown },
  send: (payload: {
    name: string;
    data: Record<string, unknown>;
    id?: string;
  }) => Promise<{ ids: string[] }>
) {
  const invocation = invocations.getStore();
  if (!invocation) {
    const store = ordinaryScopes.getStore()?.store ?? new XeroCampaignStore();
    return withOrdinaryInvocation(
      data,
      store,
      () => send({ data, name: functionId }),
      functionId
    );
  }
  if (
    data.clerkOrgId !== invocation.scope.clerkOrgId ||
    data.organisationId !== invocation.scope.organisationId
  ) {
    throw new XeroCampaignDeniedError();
  }
  const campaign = await reserveXeroCampaignTicket(
    {
      ...invocation.scope,
      ...invocation.campaign,
      candidateSha: invocation.store.input.runtimeRevision,
    },
    {
      bindingGeneration: invocation.scope.bindingGeneration,
      clerkOrgId: invocation.scope.clerkOrgId,
      dispatchId: randomUUID(),
      functionId,
      organisationId: invocation.scope.organisationId,
      scheduledSlot: null,
      schedulerRunId: null,
      targetHash: null,
      userId: null,
    },
    invocation.store.input
  );
  const sent = await send({
    data: {
      ...data,
      bindingGeneration: invocation.scope.bindingGeneration,
      campaign,
      xeroTenantId: invocation.scope.xeroTenantId,
    },
    id: `campaign:${campaign.dispatchId}`,
    name: functionId,
  });
  await recordXeroCampaignDispatch(
    invocation.scope,
    functionId,
    campaign,
    sent.ids
  );
  return sent;
}

const CAMPAIGN_COLLECTION_PATHS = new Set([
  "/payroll.xro/1.0/Employees",
  "/payroll.xro/1.0/LeaveApplications/v2",
  "/payroll.xro/2.0/employees",
]);
const CAMPAIGN_PAGE_QUERY = /^\?page=[1-9]\d*$/;
const CAMPAIGN_PROVIDER_ID = z.uuid();
function isCampaignPayrollRead(url: URL, method: string): boolean {
  // Worker and observer tickets do not grant synchronous action/target mutation authority.
  if (method !== "GET") {
    return false;
  }
  if (CAMPAIGN_COLLECTION_PATHS.has(url.pathname)) {
    return (
      url.search === "" ||
      (CAMPAIGN_PAGE_QUERY.test(url.search) &&
        Number(url.searchParams.get("page")) <= 200)
    );
  }
  if (url.search !== "") {
    return false;
  }
  if (url.pathname === "/payroll.xro/1.0/PayItems") {
    return true;
  }
  const segments = url.pathname.split("/");
  if (
    segments[0] !== "" ||
    segments[1] !== "payroll.xro" ||
    !CAMPAIGN_PROVIDER_ID.safeParse(segments[4]).success
  ) {
    return false;
  }
  if (segments[2] === "1.0") {
    return (
      segments.length === 5 &&
      (segments[3] === "Employees" || segments[3] === "LeaveApplications")
    );
  }
  if (segments[2] !== "2.0" || segments[3] !== "employees") {
    return false;
  }
  return (
    (segments.length === 6 &&
      (segments[5] === "leave" || segments[5] === "leaveBalances")) ||
    (segments.length === 7 &&
      segments[5] === "leave" &&
      CAMPAIGN_PROVIDER_ID.safeParse(segments[6]).success)
  );
}

export async function withXeroCampaignScopedEffect<T>(
  scope: Pick<XeroCampaignScope, "clerkOrgId" | "organisationId">,
  operation: () => Promise<T>
) {
  const invocation = invocations.getStore();
  if (invocation) {
    if (
      scope.clerkOrgId !== invocation.scope.clerkOrgId ||
      scope.organisationId !== invocation.scope.organisationId
    ) {
      throw new XeroCampaignDeniedError();
    }
    return withXeroCampaignEffect(invocation.scope, operation);
  }
  const store = ordinaryScopes.getStore()?.store ?? new XeroCampaignStore();
  return await withOrdinaryInvocation(scope, store, operation);
}

const actionInputSchema = z.strictObject({
  campaign: XeroCampaignEventSchema.optional(),
  clerkOrgId: z.string().min(1),
  organisationId: z.uuid(),
  target: z.json(),
  userId: z.string().min(1),
});

/** Application entrypoints supply authenticated scope and their validated action target. */
export async function withXeroCampaignAction<T>(
  functionId: string,
  value: {
    campaign?: XeroCampaignEvent;
    clerkOrgId: string;
    organisationId: string;
    target: unknown;
    userId: string;
  },
  operation: () => Promise<T>
): Promise<T> {
  const input = actionInputSchema.parse(value);
  if (actions.getStore() || invocations.getStore()) {
    throw new XeroCampaignDeniedError();
  }
  if (!input.campaign) {
    return withXeroCampaignScopedInvocation(functionId, input, operation);
  }
  const store = new XeroCampaignStore();
  const snapshot = await store.readOrganisation(input.organisationId);
  const resource = snapshot.control?.resources.find(
    (entry) =>
      entry.organisationId === input.organisationId &&
      entry.clerkOrgId === input.clerkOrgId
  );
  if (!resource) {
    throw new XeroCampaignDeniedError();
  }
  const scope = {
    bindingGeneration: resource.bindingGeneration,
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
    xeroTenantId: resource.xeroTenantId,
  };
  const admitted = await admission(scope, functionId, input.campaign, store);
  const targetHash = xeroCampaignActionTargetHash({
    clerkOrgId: input.clerkOrgId,
    functionId,
    organisationId: input.organisationId,
    target: input.target,
    userId: input.userId,
  });
  if (
    admitted.ticket?.outcome !== "reserved" ||
    admitted.ticket.userId !== input.userId ||
    admitted.ticket.targetHash !== targetHash ||
    !snapshot.control?.sanctionedActors.some(
      (actor) =>
        actor.userId === input.userId &&
        actor.clerkOrgId === input.clerkOrgId &&
        actor.organisationId === input.organisationId &&
        actor.actions.includes(functionId)
    )
  ) {
    throw new XeroCampaignDeniedError();
  }
  const { database } = await import("@repo/database");
  const bindings = await database.xeroTenant.findMany({
    select: {
      active_slot: true,
      binding_generation: true,
      id: true,
      provider_app_id: true,
      retired_at: true,
      retirement_reason: true,
      xero_tenant_id: true,
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      ...(resource.bindingState === "retired"
        ? { id: resource.xeroTenantId ?? "" }
        : { active_slot: 1, retired_at: null }),
    },
  });
  if (
    resource.bindingGeneration === 0
      ? bindings.length !== 0 || resource.xeroTenantId !== null
      : bindings.length !== 1 ||
        bindings[0]?.id !== resource.xeroTenantId ||
        bindings[0]?.binding_generation !== resource.bindingGeneration ||
        bindings[0]?.xero_tenant_id !== resource.externalTenantId
  ) {
    throw new XeroCampaignDeniedError();
  }
  if (
    resource.bindingState === "retired" &&
    (!RECONNECT_ACTIONS.has(functionId) ||
      bindings[0]?.active_slot !== null ||
      bindings[0]?.retired_at === null ||
      bindings[0]?.retirement_reason !== "disconnected" ||
      bindings[0]?.provider_app_id !== resource.providerAppId)
  ) {
    throw new XeroCampaignDeniedError();
  }
  return actions.run(
    { campaign: input.campaign, functionId, targetHash, userId: input.userId },
    () =>
      withXeroCampaignInvocation(
        functionId,
        { ...scope, campaign: input.campaign },
        operation,
        null,
        store.input
      )
  );
}

/** The signed OAuth state carries a distinct callback ticket, never a replay of start. */
export async function reserveXeroCampaignActionContinuation(
  functionId: string,
  input: { userId: string; target: unknown }
): Promise<XeroCampaignEvent | undefined> {
  const invocation = invocations.getStore();
  const action = actions.getStore();
  if (!(invocation || action)) {
    return undefined;
  }
  if (
    !(invocation && action) ||
    invocation.functionId !== "xero.oauth.start" ||
    functionId !== "xero.oauth.callback" ||
    action.userId !== input.userId
  ) {
    throw new XeroCampaignDeniedError();
  }
  const authority = await assertXeroCampaignAccess(invocation.scope);
  return reserveXeroCampaignTicket(
    {
      ...invocation.scope,
      ...invocation.campaign,
      candidateSha: invocation.store.input.runtimeRevision,
    },
    {
      bindingGeneration: invocation.scope.bindingGeneration,
      clerkOrgId: invocation.scope.clerkOrgId,
      dispatchId: randomUUID(),
      functionId,
      organisationId: invocation.scope.organisationId,
      providerRequests: authority.ticket?.providerRequests?.filter(
        (request) => request.method === "GET"
      ),
      scheduledSlot: null,
      schedulerRunId: null,
      targetHash: xeroCampaignActionTargetHash({
        clerkOrgId: invocation.scope.clerkOrgId,
        functionId,
        organisationId: invocation.scope.organisationId,
        target: input.target,
        userId: input.userId,
      }),
      userId: input.userId,
    },
    invocation.store.input
  );
}

/** Call after the service commits its binding transition and before dispatching children. */
export async function reconcileXeroCampaignActionBinding(): Promise<void> {
  const invocation = invocations.getStore();
  const action = actions.getStore();
  if (!(invocation || action)) {
    return;
  }
  if (!(invocation && action)) {
    throw new XeroCampaignDeniedError();
  }
  await trackCampaignEffect(() =>
    invocation.store.reconcileActionBinding(
      {
        ...invocation.scope,
        ...invocation.campaign,
        userId: action.userId,
      },
      (resource) => {
        invocation.scope = {
          bindingGeneration: resource.bindingGeneration,
          clerkOrgId: resource.clerkOrgId,
          organisationId: resource.organisationId,
          xeroTenantId: resource.xeroTenantId,
        };
      }
    )
  );
}

/** Run an existing registered handler with separate worker authority under the parent write guard. */
export async function withXeroCampaignChildInvocation<T>(
  functionId: string,
  data: { clerkOrgId: string; organisationId: string; [key: string]: unknown },
  handler: (payload: Record<string, unknown>) => Promise<T>
): Promise<T> {
  const parent = invocations.getStore();
  if (!parent) {
    return handler(data);
  }
  if (
    data.clerkOrgId !== parent.scope.clerkOrgId ||
    data.organisationId !== parent.scope.organisationId
  ) {
    throw new XeroCampaignDeniedError();
  }
  const campaign = await reserveXeroCampaignTicket(
    {
      ...parent.scope,
      ...parent.campaign,
      candidateSha: parent.store.input.runtimeRevision,
    },
    {
      bindingGeneration: parent.scope.bindingGeneration,
      clerkOrgId: parent.scope.clerkOrgId,
      dispatchId: randomUUID(),
      functionId,
      organisationId: parent.scope.organisationId,
      scheduledSlot: null,
      schedulerRunId: null,
      targetHash: null,
      userId: null,
    },
    parent.store.input
  );
  const result = await inlineChildren.run(
    { dispatchId: campaign.dispatchId, functionId },
    () =>
      actions.exit(() =>
        invocations.exit(() =>
          handler({
            ...data,
            bindingGeneration: parent.scope.bindingGeneration,
            campaign,
            xeroTenantId: parent.scope.xeroTenantId,
          })
        )
      )
  );
  const snapshot = await parent.store.readOrganisation(
    parent.scope.organisationId
  );
  const child = snapshot.control?.tickets.find(
    (ticket) => ticket.dispatchId === campaign.dispatchId
  );
  if (!(child && ["succeeded", "failed"].includes(child.outcome))) {
    throw new XeroCampaignDeniedError();
  }
  await assertXeroCampaignAccess(parent.scope);
  return result;
}

function ordinaryResultIsUncertain(
  context: { acceptedMutation: boolean },
  result: unknown
) {
  return (
    context.acceptedMutation &&
    result !== null &&
    typeof result === "object" &&
    Reflect.get(result, "ok") === false
  );
}
