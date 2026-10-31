import type {
  AccountDirectory,
  AccountInvitation,
  AccountMember,
} from "@repo/auth/accounts";
import {
  type AccountId,
  type AppError,
  appError,
  type OrganisationId,
  type Result,
} from "@repo/core";
import { lockPlanLimitMutations, withTenantDb } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { log } from "@repo/observability/log";
import { noemailFallbackDomain } from "@repo/seo/branding";
import { z } from "zod";

export type AccountAccessState =
  | "linkable"
  | "invitable"
  | "already_invited"
  | "member"
  | "conflict";

export type AccountAccessConflictReason =
  | "duplicate_email"
  | "fallback_email"
  | "invalid_email"
  | "user_conflict"
  | "no_email";

export interface AccountAccessCandidateView {
  conflictReason: AccountAccessConflictReason | null;
  email: string | null;
  id: string;
  name: string;
  state: AccountAccessState;
}

export interface AccountAccessReviewResult {
  alreadyInvitedCount: number;
  candidateCount: number;
  candidates: AccountAccessCandidateView[];
  conflictCount: number;
  invitableCount: number;
  linkableCount: number;
  memberCount: number;
}

export interface AccountInvitationDispatchResult {
  alreadyInvitedCount: number;
  candidateCount: number;
  conflictCount: number;
  failedCount: number;
  linkedCount: number;
  providerRequestId?: string;
  succeededCount: number;
}

export type AccountAccessServiceError =
  | AppError
  | { code: "not_authorised"; message: string }
  | { code: "validation_error"; message: string }
  | { code: "conflict"; message: string }
  | { code: "provider_error"; message: string };

const EmailSchema = z.string().trim().email();

export function normalizeEmail(
  email: string | null | undefined
): string | null {
  if (!email) {
    return null;
  }
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isFallbackEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  const normalized = email.trim().toLowerCase();
  return (
    normalized.endsWith(`@${noemailFallbackDomain.toLowerCase()}`) ||
    normalized.endsWith("@noemail.teamcalendar.online") ||
    normalized.includes("noemail.teamcalendar")
  );
}

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  return EmailSchema.safeParse(email.trim()).success;
}

export async function fetchAllAccountMembers(
  accountDirectory: AccountDirectory,
  accountId: string
): Promise<AccountMember[]> {
  assertNoTenantTransaction("fetchAllAccountMembers");
  const memberships: AccountMember[] = [];
  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await accountDirectory.listMembers({
      accountId,
      limit,
      offset,
    });
    memberships.push(...page.data);
    offset += page.data.length;
    if (offset >= page.totalCount || page.data.length === 0) {
      hasMore = false;
    }
  }

  return memberships;
}

export async function fetchAllPendingAccountInvitations(
  accountDirectory: AccountDirectory,
  accountId: string
): Promise<AccountInvitation[]> {
  assertNoTenantTransaction("fetchAllPendingAccountInvitations");
  const invitations: AccountInvitation[] = [];
  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await accountDirectory.listInvitations({
      accountId,
      limit,
      offset,
      status: ["pending"],
    });
    invitations.push(...page.data);
    offset += page.data.length;
    if (offset >= page.totalCount || page.data.length === 0) {
      hasMore = false;
    }
  }

  return invitations;
}

interface RawPerson {
  archived_at: Date | null;
  email: string | null;
  first_name: string | null;
  id: string;
  is_active: boolean;
  last_name: string | null;
  source_system: string;
  user_id: string | null;
}

interface EvaluatedPerson {
  candidateView: AccountAccessCandidateView;
  normalizedEmail: string | null;
  person: RawPerson;
  userIdToLink: string | null;
}

interface EvaluationContext {
  localEmailCounts: Map<string, number>;
  membersByEmail: Map<string, AccountMember[]>;
  pendingInvitationEmails: Set<string>;
  userIdsLinkedLocally: Set<string>;
}

function buildEvaluationContext(
  people: RawPerson[],
  memberships: AccountMember[],
  pendingInvitations: AccountInvitation[]
): EvaluationContext {
  const localEmailCounts = new Map<string, number>();
  const userIdsLinkedLocally = new Set<string>();

  for (const person of people) {
    const norm = normalizeEmail(person.email);
    if (norm) {
      localEmailCounts.set(norm, (localEmailCounts.get(norm) ?? 0) + 1);
    }
    if (person.user_id) {
      userIdsLinkedLocally.add(person.user_id);
    }
  }

  const membersByEmail = new Map<string, AccountMember[]>();
  for (const member of memberships) {
    const email = normalizeEmail(member.email);
    if (email && isValidEmail(email)) {
      const existing = membersByEmail.get(email) ?? [];
      existing.push(member);
      membersByEmail.set(email, existing);
    }
  }

  const pendingInvitationEmails = new Set<string>();
  for (const invitation of pendingInvitations) {
    const norm = normalizeEmail(invitation.email);
    if (norm) {
      pendingInvitationEmails.add(norm);
    }
  }

  return {
    localEmailCounts,
    membersByEmail,
    pendingInvitationEmails,
    userIdsLinkedLocally,
  };
}

function evaluateSinglePerson(
  person: RawPerson,
  context: EvaluationContext
): EvaluatedPerson {
  const rawName = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  const name = rawName.length > 0 ? rawName : "Unnamed";
  const normalizedEmail = normalizeEmail(person.email);

  if (person.user_id) {
    return {
      candidateView: {
        conflictReason: null,
        email: normalizedEmail,
        id: person.id,
        name,
        state: "member",
      },
      normalizedEmail,
      person,
      userIdToLink: null,
    };
  }

  if (!normalizedEmail) {
    return {
      candidateView: {
        conflictReason: "no_email",
        email: null,
        id: person.id,
        name,
        state: "conflict",
      },
      normalizedEmail: null,
      person,
      userIdToLink: null,
    };
  }

  if (isFallbackEmail(normalizedEmail)) {
    return {
      candidateView: {
        conflictReason: "fallback_email",
        email: normalizedEmail,
        id: person.id,
        name,
        state: "conflict",
      },
      normalizedEmail,
      person,
      userIdToLink: null,
    };
  }

  if (!isValidEmail(normalizedEmail)) {
    return {
      candidateView: {
        conflictReason: "invalid_email",
        email: normalizedEmail,
        id: person.id,
        name,
        state: "conflict",
      },
      normalizedEmail,
      person,
      userIdToLink: null,
    };
  }

  const localCount = context.localEmailCounts.get(normalizedEmail) ?? 0;
  if (localCount > 1) {
    return {
      candidateView: {
        conflictReason: "duplicate_email",
        email: normalizedEmail,
        id: person.id,
        name,
        state: "conflict",
      },
      normalizedEmail,
      person,
      userIdToLink: null,
    };
  }

  const matchingMembers = context.membersByEmail.get(normalizedEmail) ?? [];
  if (matchingMembers.length > 1) {
    return {
      candidateView: {
        conflictReason: "user_conflict",
        email: normalizedEmail,
        id: person.id,
        name,
        state: "conflict",
      },
      normalizedEmail,
      person,
      userIdToLink: null,
    };
  }

  if (matchingMembers.length === 1) {
    const [matchingMember] = matchingMembers;
    const matchingUserId = matchingMember.userId;

    if (!matchingUserId || context.userIdsLinkedLocally.has(matchingUserId)) {
      return {
        candidateView: {
          conflictReason: "user_conflict",
          email: normalizedEmail,
          id: person.id,
          name,
          state: "conflict",
        },
        normalizedEmail,
        person,
        userIdToLink: null,
      };
    }

    return {
      candidateView: {
        conflictReason: null,
        email: normalizedEmail,
        id: person.id,
        name,
        state: "linkable",
      },
      normalizedEmail,
      person,
      userIdToLink: matchingUserId,
    };
  }

  if (context.pendingInvitationEmails.has(normalizedEmail)) {
    return {
      candidateView: {
        conflictReason: null,
        email: normalizedEmail,
        id: person.id,
        name,
        state: "already_invited",
      },
      normalizedEmail,
      person,
      userIdToLink: null,
    };
  }

  if (person.is_active && person.source_system === "XERO") {
    return {
      candidateView: {
        conflictReason: null,
        email: normalizedEmail,
        id: person.id,
        name,
        state: "invitable",
      },
      normalizedEmail,
      person,
      userIdToLink: null,
    };
  }

  return {
    candidateView: {
      conflictReason: null,
      email: normalizedEmail,
      id: person.id,
      name,
      state: "conflict",
    },
    normalizedEmail,
    person,
    userIdToLink: null,
  };
}

async function evaluateAllPeopleAndAccountAccess(params: {
  accountId: AccountId;
  accountDirectory: AccountDirectory;
  organisationId: OrganisationId;
}): Promise<Result<EvaluatedPerson[], AccountAccessServiceError>> {
  const { accountId, accountDirectory, organisationId } = params;

  try {
    const people = await withTenantDb(accountId, (db) =>
      db.person.findMany({
        orderBy: [{ first_name: "asc" }, { last_name: "asc" }, { id: "asc" }],
        select: {
          archived_at: true,
          email: true,
          first_name: true,
          id: true,
          is_active: true,
          last_name: true,
          source_system: true,
          user_id: true,
        },
        where: {
          account_id: accountId,
          archived_at: null,
          organisation_id: organisationId,
        },
      })
    );
    const [memberships, pendingInvitations] = await Promise.all([
      fetchAllAccountMembers(accountDirectory, accountId),
      fetchAllPendingAccountInvitations(accountDirectory, accountId),
    ]);

    const context = buildEvaluationContext(
      people,
      memberships,
      pendingInvitations
    );

    const evaluated: EvaluatedPerson[] = people.map((p) =>
      evaluateSinglePerson(p, context)
    );

    return { ok: true, value: evaluated };
  } catch (error) {
    log.error("account_access.evaluation_failed", {
      accountId,
      error: error instanceof Error ? error.message : String(error),
      organisationId,
    });
    return {
      error: appError(
        "internal",
        error instanceof Error
          ? error.message
          : "Failed to evaluate Account access."
      ),
      ok: false,
    };
  }
}

export async function loadAccountAccessReview(params: {
  accountId: AccountId;
  accountDirectory: AccountDirectory;
  organisationId: OrganisationId;
}): Promise<Result<AccountAccessReviewResult, AccountAccessServiceError>> {
  assertNoTenantTransaction("loadAccountAccessReview");
  const evaluatedResult = await evaluateAllPeopleAndAccountAccess(params);
  if (!evaluatedResult.ok) {
    return evaluatedResult;
  }

  const { value: evaluated } = evaluatedResult;
  const candidates = evaluated.map((e) => e.candidateView);

  let linkableCount = 0;
  let invitableCount = 0;
  let alreadyInvitedCount = 0;
  let memberCount = 0;
  let conflictCount = 0;

  for (const candidate of candidates) {
    switch (candidate.state) {
      case "linkable":
        linkableCount += 1;
        break;
      case "invitable":
        invitableCount += 1;
        break;
      case "already_invited":
        alreadyInvitedCount += 1;
        break;
      case "member":
        memberCount += 1;
        break;
      case "conflict":
        conflictCount += 1;
        break;
      default:
        break;
    }
  }

  return {
    ok: true,
    value: {
      alreadyInvitedCount,
      candidateCount: candidates.length,
      candidates,
      conflictCount,
      invitableCount,
      linkableCount,
      memberCount,
    },
  };
}

export async function reconcileAccountAccessLinks(params: {
  accountId: AccountId;
  accountDirectory: AccountDirectory;
  organisationId: OrganisationId;
}): Promise<
  Result<
    { linkedCount: number; linkedPersonIds: string[] },
    AccountAccessServiceError
  >
> {
  assertNoTenantTransaction("reconcileAccountAccessLinks");
  const { accountId, organisationId } = params;
  const evaluatedResult = await evaluateAllPeopleAndAccountAccess(params);
  if (!evaluatedResult.ok) {
    return evaluatedResult;
  }

  const linkable = evaluatedResult.value.filter(
    (e) => e.candidateView.state === "linkable" && e.userIdToLink !== null
  );

  const linkedPersonIds: string[] = [];

  for (const item of linkable) {
    const { email } = item.person;
    if (item.userIdToLink && email) {
      const linked = await withTenantDb(accountId, async (db) => {
        await lockPlanLimitMutations(accountId, db);
        return db.person.updateMany({
          data: { user_id: item.userIdToLink },
          where: {
            account_id: accountId,
            archived_at: null,
            email,
            id: item.person.id,
            organisation_id: organisationId,
            user_id: null,
          },
        });
      });
      if (linked.count === 1) {
        linkedPersonIds.push(item.person.id);
      }
    }
  }

  return {
    ok: true,
    value: {
      linkedCount: linkedPersonIds.length,
      linkedPersonIds,
    },
  };
}

function isTransientError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const { message, status } = error as { message?: string; status?: number };
    if (
      status === 429 ||
      (typeof status === "number" && status >= 500 && status < 600)
    ) {
      return true;
    }
    if (typeof message === "string") {
      const lower = message.toLowerCase();
      return (
        lower.includes("429") ||
        lower.includes("rate limit") ||
        lower.includes("timeout") ||
        lower.includes("econnreset") ||
        lower.includes("etimedout") ||
        lower.includes("500") ||
        lower.includes("502") ||
        lower.includes("503") ||
        lower.includes("504")
      );
    }
  }
  return false;
}

async function dispatchBatchWithRetry(
  accountDirectory: AccountDirectory,
  accountId: string,
  batch: Array<{ email: string; personId: string }>,
  inviterUserId: string
): Promise<{ error?: unknown; success: boolean }> {
  let attempt = 0;
  const maxAttempts = 2;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      await accountDirectory.inviteMembers({
        accountId,
        invitations: batch.map((item) => ({
          email: item.email,
          inviterUserId,
          role: "viewer",
        })),
      });
      return { success: true };
    } catch (error) {
      const isTransient = isTransientError(error);
      if (isTransient && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      return { error, success: false };
    }
  }
  return { success: false };
}

export async function inviteAccountAccessCandidates(params: {
  candidatePersonIds?: string[];
  accountId: AccountId;
  accountDirectory: AccountDirectory;
  inviterUserId: string;
  organisationId: OrganisationId;
}): Promise<
  Result<AccountInvitationDispatchResult, AccountAccessServiceError>
> {
  assertNoTenantTransaction("inviteAccountAccessCandidates");
  const {
    candidatePersonIds,
    accountId,
    accountDirectory,
    inviterUserId,
    organisationId,
  } = params;

  // 1. Reconcile one-to-one links first
  const linkResult = await reconcileAccountAccessLinks({
    accountDirectory,
    accountId,
    organisationId,
  });
  if (!linkResult.ok) {
    return linkResult;
  }
  const { linkedCount } = linkResult.value;

  // 2. Re-evaluate people after linking
  const evaluatedResult = await evaluateAllPeopleAndAccountAccess({
    accountDirectory,
    accountId,
    organisationId,
  });
  if (!evaluatedResult.ok) {
    return evaluatedResult;
  }

  const { value: evaluated } = evaluatedResult;
  const invitableCandidates = evaluated.filter(
    (e) =>
      e.candidateView.state === "invitable" &&
      e.candidateView.email &&
      (!candidatePersonIds || candidatePersonIds.includes(e.person.id))
  );

  const alreadyInvitedCount = evaluated.filter(
    (e) => e.candidateView.state === "already_invited"
  ).length;
  const conflictCount = evaluated.filter(
    (e) => e.candidateView.state === "conflict"
  ).length;

  const { length: totalCandidateCount } = evaluated;

  // 3. Chunk invitable candidates into batches of <= 10 (max 50 batches / 50 requests per hour budget)
  const BATCH_SIZE = 10;
  const MAX_BATCHES = 50;
  const batches: Array<Array<{ email: string; personId: string }>> = [];

  for (
    let i = 0;
    i < invitableCandidates.length && batches.length < MAX_BATCHES;
    i += BATCH_SIZE
  ) {
    const chunk = invitableCandidates.slice(i, i + BATCH_SIZE).map((c) => ({
      email: c.candidateView.email as string,
      personId: c.person.id,
    }));
    batches.push(chunk);
  }

  let succeededCount = 0;
  let failedCount = 0;
  let stoppedDueToFailure = false;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    if (stoppedDueToFailure) {
      failedCount += batch.length;
      continue;
    }

    const batchResult = await dispatchBatchWithRetry(
      accountDirectory,
      accountId,
      batch,
      inviterUserId
    );

    if (batchResult.success) {
      succeededCount += batch.length;
    } else {
      log.warn("account_access.batch_invitation_failed", {
        accountId,
        batchIndex,
        batchSize: batch.length,
        error:
          batchResult.error instanceof Error
            ? batchResult.error.message
            : String(batchResult.error),
        organisationId,
      });
      stoppedDueToFailure = true;
      failedCount += batch.length;
    }
  }

  return {
    ok: true,
    value: {
      alreadyInvitedCount,
      candidateCount: totalCandidateCount,
      conflictCount,
      failedCount,
      linkedCount,
      succeededCount,
    },
  };
}
