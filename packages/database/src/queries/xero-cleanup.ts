import type {
  Prisma,
  xero_cleanup_attempt_state,
} from "../../generated/client";
import { database } from "../client";

type Client = Prisma.TransactionClient;
interface Scope {
  clerkOrgId: string;
  client?: Client;
  organisationId: string;
}
interface AttemptScope extends Scope {
  attemptId: string;
  leaseOwner: string;
  now: Date;
}
const scoped = (input: Scope) => ({
  clerk_org_id: input.clerkOrgId,
  organisation_id: input.organisationId,
});

export async function createXeroCleanupRequest(
  input: Scope & {
    data: Omit<
      Prisma.XeroCleanupRequestUncheckedCreateInput,
      "clerk_org_id" | "organisation_id" | "attempts"
    >;
    attempts?: Omit<
      Prisma.XeroCleanupAttemptUncheckedCreateWithoutRequestInput,
      "clerk_org_id" | "organisation_id"
    >[];
  }
) {
  const client = input.client ?? database;
  const binding = await client.xeroTenant.findFirst({
    select: { id: true },
    where: { ...scoped(input), id: input.data.xero_tenant_id },
  });
  if (!binding) {
    throw new Error("Cleanup request requires an owned tenant binding");
  }
  return client.xeroCleanupRequest.create({
    data: {
      ...input.data,
      ...scoped(input),
      attempts: {
        create: (input.attempts ?? []).map((attempt) => ({
          ...attempt,
          ...scoped(input),
        })),
      },
    },
    include: { attempts: true },
  });
}

export async function claimXeroCleanupAttempt(
  input: AttemptScope & {
    leaseExpiresAt: Date;
  }
): Promise<boolean> {
  if (input.leaseExpiresAt <= input.now) {
    return false;
  }
  const result = await (input.client ?? database).xeroCleanupAttempt.updateMany(
    {
      data: {
        lease_expires_at: input.leaseExpiresAt,
        lease_owner: input.leaseOwner,
        state: "claimed",
      },
      where: {
        ...scoped(input),
        id: input.attemptId,
        OR: [
          {
            OR: [
              { next_attempt_at: null },
              { next_attempt_at: { lte: input.now } },
            ],
            state: "pending",
          },
          { lease_expires_at: { lte: input.now }, state: "claimed" },
        ],
      },
    }
  );
  return result.count === 1;
}

/** Caller holds the binding lock and has checked its generation in this transaction. */
export async function markXeroCleanupAttemptDispatching(
  input: AttemptScope & {
    deadlineAt: Date;
  }
): Promise<boolean> {
  if (input.deadlineAt <= input.now) {
    return false;
  }
  const result = await (input.client ?? database).xeroCleanupAttempt.updateMany(
    {
      data: {
        deadline_at: input.deadlineAt,
        dispatched_at: input.now,
        state: "dispatching",
      },
      where: {
        ...scoped(input),
        id: input.attemptId,
        lease_expires_at: { gt: input.now },
        lease_owner: input.leaseOwner,
        state: "claimed",
      },
    }
  );
  return result.count === 1;
}

export type XeroCleanupOutcomeReason =
  | "deleted"
  | "absent"
  | "auth_failed"
  | "rate_limited"
  | "server_error"
  | "not_sent"
  | "unknown"
  | "lease_expired"
  | "superseded"
  | "report_only"
  | "operator_reissue";
const safeReasons = new Set<XeroCleanupOutcomeReason>([
  "deleted",
  "absent",
  "auth_failed",
  "rate_limited",
  "server_error",
  "not_sent",
  "unknown",
  "lease_expired",
  "superseded",
  "report_only",
  "operator_reissue",
]);
export async function recordXeroCleanupAttemptOutcome(
  input: AttemptScope & {
    state: xero_cleanup_attempt_state;
    outcomeReason?: XeroCleanupOutcomeReason;
    nextAttemptAt?: Date | null;
  }
): Promise<boolean> {
  if (input.outcomeReason && !safeReasons.has(input.outcomeReason)) {
    return false;
  }
  if (
    ![
      "pending",
      "confirmed_deleted",
      "confirmed_absent",
      "unknown",
      "blocked_authorisation",
    ].includes(input.state)
  ) {
    return false;
  }
  const result = await (input.client ?? database).xeroCleanupAttempt.updateMany(
    {
      data: {
        lease_expires_at: null,
        lease_owner: null,
        next_attempt_at: input.nextAttemptAt ?? null,
        outcome_reason: input.outcomeReason ?? null,
        retry_count: input.state === "pending" ? { increment: 1 } : undefined,
        state: input.state,
      },
      where: {
        ...scoped(input),
        id: input.attemptId,
        lease_expires_at: { gt: input.now },
        lease_owner: input.leaseOwner,
        state: "dispatching",
      },
    }
  );
  return result.count === 1;
}

/** System sweep exposes routing IDs only. Every resulting mutation is independently scoped. */
export async function listDueXeroCleanupAttempts(input: {
  now: Date;
  limit?: number;
  client?: Client;
}) {
  const attempts = await (input.client ?? database).xeroCleanupAttempt.findMany(
    {
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      select: {
        clerk_org_id: true,
        id: true,
        organisation_id: true,
        xero_cleanup_request_id: true,
      },
      take: Math.min(Math.max(input.limit ?? 50, 1), 50),
      where: {
        OR: [
          {
            OR: [
              { next_attempt_at: null },
              { next_attempt_at: { lte: input.now } },
            ],
            state: "pending",
          },
          {
            lease_expires_at: { lte: input.now },
            state: { in: ["claimed", "dispatching"] },
          },
        ],
      },
    }
  );
  return attempts.map((attempt) => ({
    attemptId: attempt.id,
    cleanupRequestId: attempt.xero_cleanup_request_id,
    clerkOrgId: attempt.clerk_org_id,
    organisationId: attempt.organisation_id,
  }));
}

/** Recover retirement after a committed confirmation. Enumerate routing identifiers only. */
export async function listResolvedXeroCleanupRequests(
  input: { limit?: number; client?: Client } = {}
): Promise<
  { requestId: string; clerkOrgId: string; organisationId: string }[]
> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 50);
  return await (input.client ?? database).$queryRaw`
    SELECT request.id::text AS "requestId",
           request.clerk_org_id AS "clerkOrgId",
           request.organisation_id::text AS "organisationId"
    FROM xero_cleanup_requests AS request
    JOIN xero_tenants AS tenant
      ON tenant.id = request.xero_tenant_id
      AND tenant.clerk_org_id = request.clerk_org_id
      AND tenant.organisation_id = request.organisation_id
      AND tenant.binding_generation = request.binding_generation
    JOIN xero_connections AS connection
      ON connection.id = tenant.xero_connection_id
      AND connection.clerk_org_id = request.clerk_org_id
      AND connection.organisation_id = request.organisation_id
    WHERE tenant.active_slot = 1 AND tenant.retired_at IS NULL
      AND connection.status = 'disconnected'
      AND EXISTS (
        SELECT 1 FROM xero_cleanup_attempts AS attempt
        WHERE attempt.xero_cleanup_request_id = request.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM xero_cleanup_attempts AS attempt
        WHERE attempt.xero_cleanup_request_id = request.id
          AND (attempt.state NOT IN ('confirmed_deleted', 'confirmed_absent', 'cancelled')
            OR attempt.clerk_org_id <> request.clerk_org_id
            OR attempt.organisation_id <> request.organisation_id
            OR attempt.expected_binding_generation <> request.binding_generation)
      )
    ORDER BY request.created_at ASC, request.id ASC LIMIT ${limit}
  `;
}

/** Aggregate-only system health query, with no customer payload or identifiers returned. */
export async function getOldestUnknownXeroCleanupUpdatedAt(
  input: { client?: Client } = {}
): Promise<Date | null> {
  const result = await (input.client ?? database).xeroCleanupAttempt.aggregate({
    _min: { updated_at: true },
    where: { state: "unknown" },
  });
  return result._min.updated_at;
}
