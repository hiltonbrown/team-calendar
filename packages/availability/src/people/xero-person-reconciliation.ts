import "server-only";

import type { Result } from "@repo/core";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { invalidateFeedCachesForPerson } from "@repo/feeds";
import { log } from "@repo/observability/log";
import { noemailFallbackDomain } from "@repo/seo/branding";

export interface ReconcileXeroPersonContext {
  clerkOrgId: string;
  organisationId: string;
}

export interface ReconcileXeroPersonInput {
  email?: string | null;
  employeeId: string;
  employmentType?: "employee" | "contractor" | "director" | "offshore" | null;
  firstName: string;
  isActive?: boolean;
  jobTitle?: string | null;
  lastName: string;
  startDate?: Date | null;
}

export type ReconcileOutcome =
  | { outcome: "exact_matched"; personId: string }
  | { outcome: "upgraded_in_place"; personId: string }
  | { outcome: "created_with_pending_match"; matchId: string; personId: string }
  | { outcome: "created"; personId: string };

export interface MergePersonMatchInput {
  actorDisplay?: string;
  actorUserId: string;
  candidatePersonId?: string | null;
  clerkOrgId: string;
  clerkUserId?: string | null;
  matchId?: string;
  organisationId: string;
  xeroPersonId: string;
}

export type ReconciliationError =
  | { code: "not_found"; message: string }
  | { code: "conflict"; message: string }
  | { code: "validation_error"; message: string };

function isSyntheticEmail(email: string | null | undefined): boolean {
  if (!email) {
    return true;
  }
  const lower = email.toLowerCase().trim();
  return (
    lower.endsWith(`@${noemailFallbackDomain}`) ||
    lower.endsWith("@internal") ||
    !lower.includes("@")
  );
}

async function findExistingExactMatch(
  client: Prisma.TransactionClient,
  context: ReconcileXeroPersonContext,
  input: ReconcileXeroPersonInput,
  resolvedEmail: string,
  employmentType: "employee" | "contractor" | "director" | "offshore",
  personType: "employee" | "contractor"
): Promise<string | null> {
  const exactMatch = await client.person.findFirst({
    where: {
      clerk_org_id: context.clerkOrgId,
      organisation_id: context.organisationId,
      xero_employee_id: input.employeeId,
    },
  });

  if (exactMatch) {
    const updated = await client.person.update({
      data: {
        archived_at: null,
        display_name: `${input.firstName} ${input.lastName}`,
        email: resolvedEmail,
        employment_type: employmentType,
        first_name: input.firstName,
        is_active: input.isActive ?? true,
        job_title: input.jobTitle ?? exactMatch.job_title,
        last_name: input.lastName,
        person_type: personType,
        start_date: input.startDate ?? exactMatch.start_date,
        updated_at: new Date(),
        xero_employee_id: input.employeeId,
        xero_missing_since: null,
      },
      where: { id: exactMatch.id },
    });
    return updated.id;
  }

  const sourceMatch = await client.person.findFirst({
    where: {
      clerk_org_id: context.clerkOrgId,
      organisation_id: context.organisationId,
      source_person_key: input.employeeId,
      source_system: "XERO",
    },
  });

  if (sourceMatch) {
    const updated = await client.person.update({
      data: {
        archived_at: null,
        display_name: `${input.firstName} ${input.lastName}`,
        email: resolvedEmail,
        employment_type: employmentType,
        first_name: input.firstName,
        is_active: input.isActive ?? true,
        job_title: input.jobTitle ?? sourceMatch.job_title,
        last_name: input.lastName,
        person_type: personType,
        start_date: input.startDate ?? sourceMatch.start_date,
        updated_at: new Date(),
        xero_employee_id: input.employeeId,
        xero_missing_since: null,
      },
      where: { id: sourceMatch.id },
    });
    return updated.id;
  }

  return null;
}

async function tryUpgradeManualCandidate(
  client: Prisma.TransactionClient,
  context: ReconcileXeroPersonContext,
  input: ReconcileXeroPersonInput,
  manualCandidates: Array<{
    email: string;
    id: string;
    job_title: string | null;
    start_date: Date | null;
  }>,
  resolvedEmail: string,
  employmentType: "employee" | "contractor" | "director" | "offshore",
  personType: "employee" | "contractor"
): Promise<string | null> {
  const hasVerifiedEmail = !isSyntheticEmail(input.email);
  if (!(hasVerifiedEmail && input.email)) {
    return null;
  }

  const emailLower = input.email.toLowerCase().trim();
  const emailMatches = manualCandidates.filter(
    (candidate) => candidate.email.toLowerCase().trim() === emailLower
  );

  const allOrgPeopleWithEmail = await client.person.findMany({
    select: { id: true, xero_employee_id: true },
    where: {
      archived_at: null,
      clerk_org_id: context.clerkOrgId,
      email: { equals: emailLower, mode: "insensitive" },
      organisation_id: context.organisationId,
    },
  });

  if (emailMatches.length === 1 && allOrgPeopleWithEmail.length === 1) {
    const [candidate] = emailMatches;
    if (candidate) {
      const upgraded = await client.person.update({
        data: {
          display_name: `${input.firstName} ${input.lastName}`,
          email: resolvedEmail,
          employment_type: employmentType,
          first_name: input.firstName,
          is_active: input.isActive ?? true,
          job_title: input.jobTitle ?? candidate.job_title,
          last_name: input.lastName,
          person_type: personType,
          source_person_key: input.employeeId,
          source_system: "XERO",
          start_date: input.startDate ?? candidate.start_date,
          updated_at: new Date(),
          xero_employee_id: input.employeeId,
          xero_missing_since: null,
        },
        where: { id: candidate.id },
      });
      return upgraded.id;
    }
  }

  return null;
}

async function handleCandidatesOrNewPerson(
  client: Prisma.TransactionClient,
  context: ReconcileXeroPersonContext,
  input: ReconcileXeroPersonInput,
  manualCandidates: Array<{
    email: string;
    first_name: string;
    id: string;
    last_name: string;
  }>,
  resolvedEmail: string,
  employmentType: "employee" | "contractor" | "director" | "offshore",
  personType: "employee" | "contractor"
): Promise<ReconcileOutcome> {
  const hasVerifiedEmail = !isSyntheticEmail(input.email);
  const nameMatches = manualCandidates.filter(
    (c) =>
      c.first_name.toLowerCase().trim() ===
        input.firstName.toLowerCase().trim() &&
      c.last_name.toLowerCase().trim() === input.lastName.toLowerCase().trim()
  );

  const candidatesToPropose = Array.from(
    new Set([
      ...manualCandidates.filter(
        (c) =>
          hasVerifiedEmail &&
          input.email &&
          c.email.toLowerCase().trim() === input.email.toLowerCase().trim()
      ),
      ...nameMatches,
    ])
  );

  const xeroPerson = await client.person.upsert({
    create: {
      clerk_org_id: context.clerkOrgId,
      default_contactability: "contactable",
      default_privacy_mode: "named",
      display_name: `${input.firstName} ${input.lastName}`,
      email: resolvedEmail,
      employment_type: employmentType,
      first_name: input.firstName,
      include_in_feeds_by_default: true,
      is_active: input.isActive ?? true,
      job_title: input.jobTitle ?? null,
      last_name: input.lastName,
      organisation_id: context.organisationId,
      person_type: personType,
      source_person_key: input.employeeId,
      source_system: "XERO",
      start_date: input.startDate ?? null,
      xero_employee_id: input.employeeId,
    },
    update: {
      archived_at: null,
      display_name: `${input.firstName} ${input.lastName}`,
      email: resolvedEmail,
      employment_type: employmentType,
      first_name: input.firstName,
      is_active: input.isActive ?? true,
      job_title: input.jobTitle ?? null,
      last_name: input.lastName,
      person_type: personType,
      start_date: input.startDate ?? null,
      updated_at: new Date(),
      xero_employee_id: input.employeeId,
      xero_missing_since: null,
    },
    where: {
      clerk_org_id: context.clerkOrgId,
      organisation_id_source_system_source_person_key: {
        organisation_id: context.organisationId,
        source_person_key: input.employeeId,
        source_system: "XERO",
      },
    },
  });

  if (candidatesToPropose.length === 0) {
    return { outcome: "created", personId: xeroPerson.id };
  }

  let primaryMatchId = "";
  for (const candidate of candidatesToPropose) {
    const isEmailMatch =
      hasVerifiedEmail &&
      input.email &&
      candidate.email.toLowerCase().trim() === input.email.toLowerCase().trim();
    const detectedReason = isEmailMatch ? "duplicate_email" : "name_match";

    const match = await client.xeroPersonMatch.upsert({
      create: {
        candidate_person_id: candidate.id,
        clerk_org_id: context.clerkOrgId,
        detected_reason: detectedReason,
        organisation_id: context.organisationId,
        status: "pending",
        xero_person_id: xeroPerson.id,
      },
      update: {
        detected_reason: detectedReason,
      },
      where: {
        xero_person_id_candidate_person_id: {
          candidate_person_id: candidate.id,
          xero_person_id: xeroPerson.id,
        },
      },
    });
    if (!primaryMatchId) {
      primaryMatchId = match.id;
    }
  }

  return {
    matchId: primaryMatchId,
    outcome: "created_with_pending_match",
    personId: xeroPerson.id,
  };
}

/**
 * Reconciles an incoming Xero employee with canonical people.
 * 1. Checks exact source employee ID match first.
 * 2. If no exact match, checks manual candidate people.
 * 3. If single unambiguous manual person with verified email, upgrades in place.
 * 4. If ambiguous (name-only, duplicate email, missing email), creates Xero person and pending match.
 * 5. If no candidates, creates Xero person.
 */
export async function reconcileXeroPerson(
  context: ReconcileXeroPersonContext,
  input: ReconcileXeroPersonInput,
  tx?: Prisma.TransactionClient
): Promise<ReconcileOutcome> {
  const client = tx ?? database;
  const rawEmail =
    input.email?.trim() ||
    `${input.firstName}.${input.lastName}@${noemailFallbackDomain}`;
  const resolvedEmail = rawEmail.toLowerCase();
  const employmentType = input.employmentType ?? "employee";
  const personType =
    employmentType === "contractor" ? "contractor" : "employee";

  // 1. Exact match on xero_employee_id or source_person_key
  const exactMatchedPersonId = await findExistingExactMatch(
    client,
    context,
    input,
    resolvedEmail,
    employmentType,
    personType
  );
  if (exactMatchedPersonId) {
    return { outcome: "exact_matched", personId: exactMatchedPersonId };
  }

  // 2. Discover manual candidate people in this organisation
  const manualCandidates = await client.person.findMany({
    where: {
      archived_at: null,
      clerk_org_id: context.clerkOrgId,
      organisation_id: context.organisationId,
      xero_employee_id: null,
    },
  });

  // 3. Single unambiguous manual person upgrade
  const upgradedPersonId = await tryUpgradeManualCandidate(
    client,
    context,
    input,
    manualCandidates,
    resolvedEmail,
    employmentType,
    personType
  );
  if (upgradedPersonId) {
    return { outcome: "upgraded_in_place", personId: upgradedPersonId };
  }

  // 4. Check for ambiguous candidates or create new person
  return await handleCandidatesOrNewPerson(
    client,
    context,
    input,
    manualCandidates,
    resolvedEmail,
    employmentType,
    personType
  );
}

interface ValidatedMergeTarget {
  candidatePerson: Prisma.PersonGetPayload<Record<string, never>> | null;
  resolvedClerkUserId: string | null;
  xeroPerson: Prisma.PersonGetPayload<Record<string, never>>;
}

async function validateMergeInput(
  client: Prisma.TransactionClient,
  context: ReconcileXeroPersonContext,
  input: MergePersonMatchInput
): Promise<Result<ValidatedMergeTarget, ReconciliationError>> {
  const xeroPerson = await client.person.findFirst({
    where: {
      clerk_org_id: context.clerkOrgId,
      id: input.xeroPersonId,
      organisation_id: context.organisationId,
    },
  });

  if (!xeroPerson) {
    return {
      error: { code: "not_found", message: "Xero person not found." },
      ok: false,
    };
  }

  const candidatePerson = input.candidatePersonId
    ? await client.person.findFirst({
        where: {
          clerk_org_id: context.clerkOrgId,
          id: input.candidatePersonId,
          organisation_id: context.organisationId,
        },
      })
    : null;

  if (input.candidatePersonId && !candidatePerson) {
    return {
      error: { code: "not_found", message: "Candidate person not found." },
      ok: false,
    };
  }

  if (candidatePerson?.archived_at) {
    return {
      error: {
        code: "conflict",
        message: "Candidate person is already archived.",
      },
      ok: false,
    };
  }

  const resolvedClerkUserId =
    input.clerkUserId ?? candidatePerson?.clerk_user_id ?? null;

  if (resolvedClerkUserId) {
    const excludedIds = [xeroPerson.id, candidatePerson?.id].filter(
      Boolean
    ) as string[];
    const alreadyLinked = await client.person.findFirst({
      select: { id: true },
      where: {
        clerk_org_id: context.clerkOrgId,
        clerk_user_id: resolvedClerkUserId,
        id: { notIn: excludedIds },
        organisation_id: context.organisationId,
      },
    });

    if (alreadyLinked) {
      return {
        error: {
          code: "validation_error",
          message:
            "That user is already linked to another person in this organisation.",
        },
        ok: false,
      };
    }
  }

  return {
    ok: true,
    value: { candidatePerson, resolvedClerkUserId, xeroPerson },
  };
}

async function transferCandidateRelations(
  client: Prisma.TransactionClient,
  context: ReconcileXeroPersonContext,
  candidatePerson: Prisma.PersonGetPayload<Record<string, never>>,
  xeroPerson: Prisma.PersonGetPayload<Record<string, never>>
): Promise<void> {
  await client.person.updateMany({
    data: { manager_person_id: xeroPerson.id },
    where: {
      clerk_org_id: context.clerkOrgId,
      manager_person_id: candidatePerson.id,
      organisation_id: context.organisationId,
    },
  });

  if (
    !xeroPerson.manager_person_id &&
    candidatePerson.manager_person_id &&
    candidatePerson.manager_person_id !== xeroPerson.id
  ) {
    await client.person.update({
      data: { manager_person_id: candidatePerson.manager_person_id },
      where: { id: xeroPerson.id },
    });
  }

  const personUpdates: Prisma.PersonUpdateInput = {};
  if (!xeroPerson.team_id && candidatePerson.team_id) {
    personUpdates.team = { connect: { id: candidatePerson.team_id } };
  }
  if (!xeroPerson.location_id && candidatePerson.location_id) {
    personUpdates.location = {
      connect: { id: candidatePerson.location_id },
    };
  }
  if (Object.keys(personUpdates).length > 0) {
    await client.person.update({
      data: personUpdates,
      where: { id: xeroPerson.id },
    });
  }

  await client.availabilityRecord.updateMany({
    data: { person_id: xeroPerson.id },
    where: {
      clerk_org_id: context.clerkOrgId,
      organisation_id: context.organisationId,
      person_id: candidatePerson.id,
    },
  });

  await client.availabilityRecord.updateMany({
    data: { approved_by_person_id: xeroPerson.id },
    where: {
      approved_by_person_id: candidatePerson.id,
      clerk_org_id: context.clerkOrgId,
      organisation_id: context.organisationId,
    },
  });

  await client.alternativeContact.updateMany({
    data: { person_id: xeroPerson.id },
    where: {
      clerk_org_id: context.clerkOrgId,
      organisation_id: context.organisationId,
      person_id: candidatePerson.id,
    },
  });

  await client.notification.updateMany({
    data: { recipient_person_id: xeroPerson.id },
    where: {
      clerk_org_id: context.clerkOrgId,
      organisation_id: context.organisationId,
      recipient_person_id: candidatePerson.id,
    },
  });
}

async function transferCandidateBalancesAndScopes(
  client: Prisma.TransactionClient,
  context: ReconcileXeroPersonContext,
  candidatePerson: Prisma.PersonGetPayload<Record<string, never>>,
  xeroPerson: Prisma.PersonGetPayload<Record<string, never>>
): Promise<void> {
  const xeroBalances = await client.leaveBalance.findMany({
    where: {
      clerk_org_id: context.clerkOrgId,
      organisation_id: context.organisationId,
      person_id: xeroPerson.id,
    },
  });

  const candidateBalances = await client.leaveBalance.findMany({
    where: {
      clerk_org_id: context.clerkOrgId,
      organisation_id: context.organisationId,
      person_id: candidatePerson.id,
    },
  });

  for (const cb of candidateBalances) {
    const isConflict = xeroBalances.some(
      (xb) =>
        xb.xero_connection_id === cb.xero_connection_id &&
        xb.leave_type_xero_id === cb.leave_type_xero_id
    );
    if (isConflict) {
      await client.leaveBalance.delete({ where: { id: cb.id } });
    } else {
      await client.leaveBalance.update({
        data: { person_id: xeroPerson.id },
        where: { id: cb.id },
      });
    }
  }

  const candidateScopes = await client.feedScope.findMany({
    where: {
      clerk_org_id: context.clerkOrgId,
      organisation_id: context.organisationId,
      scope_type: "person",
      scope_value: candidatePerson.id,
    },
  });

  for (const scopeItem of candidateScopes) {
    const targetScopeExists = await client.feedScope.findFirst({
      where: {
        clerk_org_id: context.clerkOrgId,
        feed_id: scopeItem.feed_id,
        organisation_id: context.organisationId,
        scope_type: "person",
        scope_value: xeroPerson.id,
      },
    });
    if (targetScopeExists) {
      await client.feedScope.delete({ where: { id: scopeItem.id } });
    } else {
      await client.feedScope.update({
        data: { scope_value: xeroPerson.id },
        where: { id: scopeItem.id },
      });
    }
  }

  await client.person.update({
    data: {
      archived_at: new Date(),
      clerk_user_id: null,
      updated_at: new Date(),
    },
    where: { id: candidatePerson.id },
  });
}

async function finaliseMergeAndAudit(
  client: Prisma.TransactionClient,
  context: ReconcileXeroPersonContext,
  input: MergePersonMatchInput,
  candidatePerson: Prisma.PersonGetPayload<Record<string, never>> | null,
  xeroPerson: Prisma.PersonGetPayload<Record<string, never>>,
  resolvedClerkUserId: string | null
): Promise<void> {
  if (resolvedClerkUserId) {
    await client.person.update({
      data: {
        clerk_user_id: resolvedClerkUserId,
        updated_at: new Date(),
      },
      where: { id: xeroPerson.id },
    });
  }

  if (input.matchId) {
    await client.xeroPersonMatch.update({
      data: {
        resolution_note: "Linked Xero person to candidate profile.",
        resolved_at: new Date(),
        resolved_by_user_id: input.actorUserId,
        resolved_clerk_user_id: resolvedClerkUserId,
        resolved_person_id: xeroPerson.id,
        status: "matched",
      },
      where: { id: input.matchId },
    });
  }

  await client.auditEvent.create({
    data: {
      action: "xero.person_match_resolved",
      actor_display: input.actorDisplay ?? input.actorUserId,
      actor_user_id: input.actorUserId,
      clerk_org_id: context.clerkOrgId,
      entity_id: input.matchId ?? xeroPerson.id,
      entity_type: "xero_person_match",
      metadata: {
        candidatePersonId: candidatePerson?.id ?? null,
        resolvedClerkUserId,
        xeroPersonId: xeroPerson.id,
      },
      organisation_id: context.organisationId,
      resource_id: input.matchId ?? xeroPerson.id,
      resource_type: "xero_person_match",
    },
  });

  try {
    if (candidatePerson) {
      await invalidateFeedCachesForPerson({
        clerkOrgId: context.clerkOrgId,
        organisationId: context.organisationId,
        personId: candidatePerson.id,
      });
    }
    await invalidateFeedCachesForPerson({
      clerkOrgId: context.clerkOrgId,
      organisationId: context.organisationId,
      personId: xeroPerson.id,
    });
  } catch (err) {
    log.warn("Failed to invalidate feed caches during person merge", { err });
  }
}

/**
 * Transactional merge of a candidate person into an imported Xero person.
 * Transfers availability records, balances, manager links, feed scopes, and notifications,
 * checks for unique constraint conflicts, archives candidate, and links Clerk user ID.
 */
export async function mergeCandidateIntoXeroPerson(
  context: ReconcileXeroPersonContext,
  input: MergePersonMatchInput,
  tx?: Prisma.TransactionClient
): Promise<
  Result<{ merged: true; xeroPersonId: string }, ReconciliationError>
> {
  const runMerge = async (client: Prisma.TransactionClient) => {
    const validation = await validateMergeInput(client, context, input);
    if (!validation.ok) {
      return validation;
    }
    const { candidatePerson, resolvedClerkUserId, xeroPerson } =
      validation.value;

    if (candidatePerson && candidatePerson.id !== xeroPerson.id) {
      await transferCandidateRelations(
        client,
        context,
        candidatePerson,
        xeroPerson
      );
      await transferCandidateBalancesAndScopes(
        client,
        context,
        candidatePerson,
        xeroPerson
      );
    }

    await finaliseMergeAndAudit(
      client,
      context,
      input,
      candidatePerson,
      xeroPerson,
      resolvedClerkUserId
    );

    return {
      ok: true as const,
      value: { merged: true as const, xeroPersonId: xeroPerson.id },
    };
  };

  if (tx) {
    return await runMerge(tx);
  }
  return await database.$transaction(runMerge);
}

/**
 * Ignores a pending match proposal, marking the records as distinct.
 */
export async function ignorePersonMatch(
  context: ReconcileXeroPersonContext,
  input: {
    actorDisplay?: string;
    actorUserId: string;
    matchId: string;
  },
  tx?: Prisma.TransactionClient
): Promise<Result<{ ignored: true }, ReconciliationError>> {
  const runIgnore = async (client: Prisma.TransactionClient) => {
    const match = await client.xeroPersonMatch.findFirst({
      where: {
        clerk_org_id: context.clerkOrgId,
        id: input.matchId,
        organisation_id: context.organisationId,
      },
    });

    if (!match) {
      return {
        error: { code: "not_found", message: "Match not found." } as const,
        ok: false as const,
      };
    }

    await client.xeroPersonMatch.update({
      data: {
        resolution_note: "Marked as separate records by admin.",
        resolved_at: new Date(),
        resolved_by_user_id: input.actorUserId,
        status: "ignored",
      },
      where: { id: match.id },
    });

    await client.auditEvent.create({
      data: {
        action: "xero.person_match_ignored",
        actor_display: input.actorDisplay ?? input.actorUserId,
        actor_user_id: input.actorUserId,
        clerk_org_id: context.clerkOrgId,
        entity_id: match.id,
        entity_type: "xero_person_match",
        metadata: {
          candidatePersonId: match.candidate_person_id,
          xeroPersonId: match.xero_person_id,
        },
        organisation_id: context.organisationId,
        resource_id: match.id,
        resource_type: "xero_person_match",
      },
    });

    return { ok: true as const, value: { ignored: true as const } };
  };

  if (tx) {
    return await runIgnore(tx);
  }
  return await database.$transaction(runIgnore);
}
