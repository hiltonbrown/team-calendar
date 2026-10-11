import {
  type AppError,
  appError,
  type ClerkOrgId,
  type OrganisationId,
  type Result,
} from "@repo/core";
import { tenantDatabase } from "@repo/database";
import { log } from "@repo/observability/log";
import { noemailFallbackDomain } from "@repo/seo/branding";
import { z } from "zod";

export type ClerkAccessState =
  | "linkable"
  | "invitable"
  | "already_invited"
  | "member"
  | "conflict";

export type ClerkAccessConflictReason =
  | "duplicate_email"
  | "fallback_email"
  | "invalid_email"
  | "clerk_user_conflict"
  | "no_email";

export interface ClerkAccessCandidateView {
  conflictReason: ClerkAccessConflictReason | null;
  email: string | null;
  id: string;
  name: string;
  state: ClerkAccessState;
}

export interface ClerkAccessReviewResult {
  alreadyInvitedCount: number;
  candidateCount: number;
  candidates: ClerkAccessCandidateView[];
  conflictCount: number;
  invitableCount: number;
  linkableCount: number;
  memberCount: number;
}

export interface ClerkInvitationDispatchResult {
  alreadyInvitedCount: number;
  candidateCount: number;
  conflictCount: number;
  failedCount: number;
  linkedCount: number;
  providerRequestId?: string;
  succeededCount: number;
}

export type ClerkAccessServiceError =
  | AppError
  | { code: "not_authorised"; message: string }
  | { code: "validation_error"; message: string }
  | { code: "conflict"; message: string }
  | { code: "provider_error"; message: string };

export interface ClerkMembershipResource {
  id: string;
  publicUserData?: {
    firstName?: string | null;
    identifier?: string | null;
    lastName?: string | null;
    userId: string;
  } | null;
  role?: string;
  userId?: string;
}

export interface ClerkInvitationResource {
  emailAddress: string;
  id: string;
  role?: string;
  status?: string;
}

export interface ClerkOrganizationsApi {
  createOrganizationInvitationBulk: (
    organizationId: string,
    invitations: Array<{
      emailAddress: string;
      inviterUserId?: string;
      role: "org:admin" | "org:member" | "org:viewer" | string;
    }>
  ) => Promise<{
    data: ClerkInvitationResource[];
    totalCount: number;
  }>;
  getOrganizationInvitationList: (params: {
    limit?: number;
    offset?: number;
    organizationId: string;
    status?: Array<"pending" | "accepted" | "revoked">;
  }) => Promise<{
    data: ClerkInvitationResource[];
    totalCount: number;
  }>;
  getOrganizationMembershipList: (params: {
    limit?: number;
    offset?: number;
    organizationId: string;
  }) => Promise<{
    data: ClerkMembershipResource[];
    totalCount: number;
  }>;
}

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

export async function fetchAllClerkMemberships(
  clerkOrganizations: ClerkOrganizationsApi,
  organizationId: string
): Promise<ClerkMembershipResource[]> {
  const memberships: ClerkMembershipResource[] = [];
  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await clerkOrganizations.getOrganizationMembershipList({
      limit,
      offset,
      organizationId,
    });
    memberships.push(...page.data);
    offset += page.data.length;
    if (offset >= page.totalCount || page.data.length === 0) {
      hasMore = false;
    }
  }

  return memberships;
}

export async function fetchAllClerkPendingInvitations(
  clerkOrganizations: ClerkOrganizationsApi,
  organizationId: string
): Promise<ClerkInvitationResource[]> {
  const invitations: ClerkInvitationResource[] = [];
  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await clerkOrganizations.getOrganizationInvitationList({
      limit,
      offset,
      organizationId,
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
  clerk_user_id: string | null;
  email: string | null;
  first_name: string | null;
  id: string;
  is_active: boolean;
  last_name: string | null;
  source_system: string;
}

interface EvaluatedPerson {
  candidateView: ClerkAccessCandidateView;
  clerkUserIdToLink: string | null;
  normalizedEmail: string | null;
  person: RawPerson;
}

interface EvaluationContext {
  clerkMembersByEmail: Map<string, ClerkMembershipResource[]>;
  clerkUserIdsLinkedLocally: Set<string>;
  localEmailCounts: Map<string, number>;
  pendingInvitationEmails: Set<string>;
}

function buildEvaluationContext(
  people: RawPerson[],
  memberships: ClerkMembershipResource[],
  pendingInvitations: ClerkInvitationResource[]
): EvaluationContext {
  const localEmailCounts = new Map<string, number>();
  const clerkUserIdsLinkedLocally = new Set<string>();

  for (const person of people) {
    const norm = normalizeEmail(person.email);
    if (norm) {
      localEmailCounts.set(norm, (localEmailCounts.get(norm) ?? 0) + 1);
    }
    if (person.clerk_user_id) {
      clerkUserIdsLinkedLocally.add(person.clerk_user_id);
    }
  }

  const clerkMembersByEmail = new Map<string, ClerkMembershipResource[]>();
  for (const member of memberships) {
    const email = normalizeEmail(
      member.publicUserData?.identifier ??
        (member as { emailAddress?: string }).emailAddress
    );
    if (email && isValidEmail(email)) {
      const existing = clerkMembersByEmail.get(email) ?? [];
      existing.push(member);
      clerkMembersByEmail.set(email, existing);
    }
  }

  const pendingInvitationEmails = new Set<string>();
  for (const invitation of pendingInvitations) {
    const norm = normalizeEmail(invitation.emailAddress);
    if (norm) {
      pendingInvitationEmails.add(norm);
    }
  }

  return {
    clerkMembersByEmail,
    clerkUserIdsLinkedLocally,
    localEmailCounts,
    pendingInvitationEmails,
  };
}

function evaluateSinglePerson(
  person: RawPerson,
  context: EvaluationContext
): EvaluatedPerson {
  const rawName = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  const name = rawName.length > 0 ? rawName : "Unnamed";
  const normalizedEmail = normalizeEmail(person.email);

  if (person.clerk_user_id) {
    return {
      candidateView: {
        conflictReason: null,
        email: normalizedEmail,
        id: person.id,
        name,
        state: "member",
      },
      clerkUserIdToLink: null,
      normalizedEmail,
      person,
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
      clerkUserIdToLink: null,
      normalizedEmail: null,
      person,
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
      clerkUserIdToLink: null,
      normalizedEmail,
      person,
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
      clerkUserIdToLink: null,
      normalizedEmail,
      person,
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
      clerkUserIdToLink: null,
      normalizedEmail,
      person,
    };
  }

  const matchingClerkMembers =
    context.clerkMembersByEmail.get(normalizedEmail) ?? [];
  if (matchingClerkMembers.length > 1) {
    return {
      candidateView: {
        conflictReason: "clerk_user_conflict",
        email: normalizedEmail,
        id: person.id,
        name,
        state: "conflict",
      },
      clerkUserIdToLink: null,
      normalizedEmail,
      person,
    };
  }

  if (matchingClerkMembers.length === 1) {
    const [matchingMember] = matchingClerkMembers;
    const matchingUserId =
      matchingMember.publicUserData?.userId ?? matchingMember.userId;

    if (
      !matchingUserId ||
      context.clerkUserIdsLinkedLocally.has(matchingUserId)
    ) {
      return {
        candidateView: {
          conflictReason: "clerk_user_conflict",
          email: normalizedEmail,
          id: person.id,
          name,
          state: "conflict",
        },
        clerkUserIdToLink: null,
        normalizedEmail,
        person,
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
      clerkUserIdToLink: matchingUserId,
      normalizedEmail,
      person,
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
      clerkUserIdToLink: null,
      normalizedEmail,
      person,
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
      clerkUserIdToLink: null,
      normalizedEmail,
      person,
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
    clerkUserIdToLink: null,
    normalizedEmail,
    person,
  };
}

async function evaluateAllPeopleAndClerkAccess(params: {
  clerkOrgId: ClerkOrgId;
  clerkOrganizations: ClerkOrganizationsApi;
  organisationId: OrganisationId;
}): Promise<Result<EvaluatedPerson[], ClerkAccessServiceError>> {
  const { clerkOrgId, clerkOrganizations, organisationId } = params;

  try {
    const [people, memberships, pendingInvitations] = await Promise.all([
      tenantDatabase(clerkOrgId).person.findMany({
        orderBy: [{ first_name: "asc" }, { last_name: "asc" }, { id: "asc" }],
        select: {
          archived_at: true,
          clerk_user_id: true,
          email: true,
          first_name: true,
          id: true,
          is_active: true,
          last_name: true,
          source_system: true,
        },
        where: {
          archived_at: null,
          clerk_org_id: clerkOrgId,
          organisation_id: organisationId,
        },
      }),
      fetchAllClerkMemberships(clerkOrganizations, clerkOrgId),
      fetchAllClerkPendingInvitations(clerkOrganizations, clerkOrgId),
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
    log.error("clerk_access.evaluation_failed", {
      clerkOrgId,
      error: error instanceof Error ? error.message : String(error),
      organisationId,
    });
    return {
      error: appError(
        "internal",
        error instanceof Error
          ? error.message
          : "Failed to evaluate Clerk access."
      ),
      ok: false,
    };
  }
}

export async function loadClerkAccessReview(params: {
  clerkOrgId: ClerkOrgId;
  clerkOrganizations: ClerkOrganizationsApi;
  organisationId: OrganisationId;
}): Promise<Result<ClerkAccessReviewResult, ClerkAccessServiceError>> {
  const evaluatedResult = await evaluateAllPeopleAndClerkAccess(params);
  if (!evaluatedResult.ok) {
    return evaluatedResult;
  }

  const evaluated = evaluatedResult.value;
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

export async function reconcileClerkAccessLinks(params: {
  clerkOrgId: ClerkOrgId;
  clerkOrganizations: ClerkOrganizationsApi;
  organisationId: OrganisationId;
}): Promise<
  Result<
    { linkedCount: number; linkedPersonIds: string[] },
    ClerkAccessServiceError
  >
> {
  const { clerkOrgId, organisationId } = params;
  const evaluatedResult = await evaluateAllPeopleAndClerkAccess(params);
  if (!evaluatedResult.ok) {
    return evaluatedResult;
  }

  const linkable = evaluatedResult.value.filter(
    (e) => e.candidateView.state === "linkable" && e.clerkUserIdToLink !== null
  );

  const linkedPersonIds: string[] = [];

  for (const item of linkable) {
    if (item.clerkUserIdToLink) {
      await tenantDatabase(clerkOrgId).person.update({
        data: { clerk_user_id: item.clerkUserIdToLink },
        where: {
          clerk_org_id: clerkOrgId,
          id: item.person.id,
          organisation_id: organisationId,
        },
      });
      linkedPersonIds.push(item.person.id);
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
  clerkOrganizations: ClerkOrganizationsApi,
  clerkOrgId: string,
  batch: Array<{ email: string; personId: string }>,
  inviterUserId: string
): Promise<{ error?: unknown; success: boolean }> {
  let attempt = 0;
  const maxAttempts = 2;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      await clerkOrganizations.createOrganizationInvitationBulk(
        clerkOrgId,
        batch.map((item) => ({
          emailAddress: item.email,
          inviterUserId,
          role: "org:viewer",
        }))
      );
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

export async function inviteClerkAccessCandidates(params: {
  candidatePersonIds?: string[];
  clerkOrgId: ClerkOrgId;
  clerkOrganizations: ClerkOrganizationsApi;
  inviterUserId: string;
  organisationId: OrganisationId;
}): Promise<Result<ClerkInvitationDispatchResult, ClerkAccessServiceError>> {
  const {
    candidatePersonIds,
    clerkOrgId,
    clerkOrganizations,
    inviterUserId,
    organisationId,
  } = params;

  // 1. Reconcile one-to-one links first
  const linkResult = await reconcileClerkAccessLinks({
    clerkOrganizations,
    clerkOrgId,
    organisationId,
  });
  if (!linkResult.ok) {
    return linkResult;
  }
  const { linkedCount } = linkResult.value;

  // 2. Re-evaluate people after linking
  const evaluatedResult = await evaluateAllPeopleAndClerkAccess({
    clerkOrganizations,
    clerkOrgId,
    organisationId,
  });
  if (!evaluatedResult.ok) {
    return evaluatedResult;
  }

  const evaluated = evaluatedResult.value;
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

  const totalCandidateCount = evaluated.length;

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
      clerkOrganizations,
      clerkOrgId,
      batch,
      inviterUserId
    );

    if (batchResult.success) {
      succeededCount += batch.length;
    } else {
      log.warn("clerk_access.batch_invitation_failed", {
        batchIndex,
        batchSize: batch.length,
        clerkOrgId,
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
