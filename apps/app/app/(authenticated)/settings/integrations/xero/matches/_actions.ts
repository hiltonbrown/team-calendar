"use server";

import { requireRole } from "@repo/auth/helpers";
import { auth, clerkClient, currentUser } from "@repo/auth/server";
import {
  ignorePersonMatch,
  mergeCandidateIntoXeroPerson,
} from "@repo/availability";
import type { Result } from "@repo/core";
import { type TenantDb, withTenantDb, withTenantResult } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { log } from "@repo/observability/log";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ResolveMatchSchema = z.object({
  clerkUserId: z.string().trim().startsWith("user_").optional(),
  matchId: z.string().uuid(),
  organisationId: z.string().uuid(),
  resolution: z.enum(["ignore", "match"]),
});

type ActionError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

type ParsedInput = z.infer<typeof ResolveMatchSchema>;
interface OrgContextValue {
  clerkOrgId: string;
  organisationId: string;
}
type CallerUser = Exclude<Awaited<ReturnType<typeof currentUser>>, null>;
type MatchWithRelations = Exclude<Awaited<ReturnType<typeof loadMatch>>, null>;

export async function resolveXeroPersonMatchAction(input: {
  clerkUserId?: string;
  matchId: string;
  organisationId: string;
  resolution: "ignore" | "match";
}): Promise<ActionResult<{ resolved: true }>> {
  assertNoTenantTransaction("resolveXeroPersonMatchAction");
  const [admin, owner] = await Promise.all([
    requireRole("org:admin"),
    requireRole("org:owner"),
  ]);
  if (!(admin || owner)) {
    return notAuthorised();
  }
  const parsed = ResolveMatchSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const caller = await resolveCallerContext(parsed.data.organisationId);
  if (!caller.ok) {
    return caller;
  }
  const { orgId, user, context } = caller.value;

  const match = await withTenantDb(orgId, async (db) => {
    const company = await db.organisation.findFirst({
      select: { id: true },
      where: { clerk_org_id: orgId, id: context.organisationId },
    });
    return company ? loadMatch(context, parsed.data.matchId, db) : null;
  });
  if (!match) {
    return unknownError("Possible match not found.");
  }

  const clerkUserId = await resolveClerkUserId({
    match,
    orgId,
    parsed: parsed.data,
  });
  if (!clerkUserId.ok) {
    return clerkUserId;
  }

  const applied = await applyResolution({
    context,
    match,
    parsed: parsed.data,
    resolvedClerkUserId: clerkUserId.value,
    user,
  });
  if (!applied.ok) {
    return applied;
  }

  revalidatePath("/settings/integrations/xero/matches");
  return { ok: true, value: { resolved: true } };
}

async function resolveCallerContext(
  organisationId: string
): Promise<
  ActionResult<{ context: OrgContextValue; orgId: string; user: CallerUser }>
> {
  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  if (
    !(orgId && user) ||
    (orgRole !== "org:owner" && orgRole !== "org:admin")
  ) {
    return notAuthorised();
  }

  return {
    ok: true,
    value: { context: { clerkOrgId: orgId, organisationId }, orgId, user },
  };
}

function loadMatch(context: OrgContextValue, matchId: string, db: TenantDb) {
  return db.xeroPersonMatch.findFirst({
    include: {
      candidate_person: {
        select: {
          clerk_user_id: true,
          id: true,
        },
      },
      xero_person: {
        select: {
          id: true,
        },
      },
    },
    where: {
      // Both tenant keys: one Clerk Organisation can own several Organisation
      // rows (one per Xero file), so clerk_org_id alone spans payroll entities.
      clerk_org_id: context.clerkOrgId,
      id: matchId,
      organisation_id: context.organisationId,
    },
  });
}

async function resolveClerkUserId(args: {
  match: MatchWithRelations;
  orgId: string;
  parsed: ParsedInput;
}): Promise<ActionResult<string | null>> {
  const { match, orgId, parsed } = args;
  const resolvedClerkUserId =
    parsed.resolution === "match"
      ? (parsed.clerkUserId ?? match.candidate_person?.clerk_user_id ?? null)
      : null;
  if (parsed.resolution === "match" && !resolvedClerkUserId) {
    return validationError(
      "Enter the Clerk user ID to link, or create a candidate person with a linked user first."
    );
  }

  if (parsed.resolution === "match" && parsed.clerkUserId) {
    const membership = await isOrganisationMember({
      clerkOrgId: orgId,
      clerkUserId: parsed.clerkUserId,
    });
    if (!membership.ok) {
      return validationError(membership.message);
    }
  }

  return { ok: true, value: resolvedClerkUserId };
}

async function applyResolution(args: {
  context: OrgContextValue;
  match: MatchWithRelations;
  parsed: ParsedInput;
  resolvedClerkUserId: string | null;
  user: CallerUser;
}): Promise<ActionResult<void>> {
  const { context, parsed, resolvedClerkUserId, user } = args;
  return await withTenantResult(
    context.clerkOrgId,
    async (db): Promise<ActionResult<void>> => {
      const company = await db.organisation.findFirst({
        select: { id: true },
        where: { clerk_org_id: context.clerkOrgId, id: context.organisationId },
      });
      if (!company) {
        return notAuthorised();
      }
      const match = await loadMatch(context, parsed.matchId, db);
      if (match?.status !== "pending") {
        return validationError(
          "This possible match has already changed. Reload and try again."
        );
      }

      const actorDisplay =
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.emailAddresses[0]?.emailAddress ||
        user.id;

      if (parsed.resolution === "match") {
        const result = await mergeCandidateIntoXeroPerson(
          {
            clerkOrgId: context.clerkOrgId,
            organisationId: context.organisationId,
          },
          {
            actorDisplay,
            actorUserId: user.id,
            candidatePersonId: match.candidate_person?.id ?? null,
            clerkOrgId: context.clerkOrgId,
            clerkUserId: resolvedClerkUserId,
            matchId: match.id,
            organisationId: match.organisation_id,
            xeroPersonId: match.xero_person.id,
          },
          db
        );
        if (!result.ok) {
          return unknownError(result.error.message);
        }
      } else {
        const result = await ignorePersonMatch(
          {
            clerkOrgId: context.clerkOrgId,
            organisationId: context.organisationId,
          },
          {
            actorDisplay,
            actorUserId: user.id,
            matchId: match.id,
          },
          db
        );
        if (!result.ok) {
          return unknownError(result.error.message);
        }
      }

      return { ok: true, value: undefined };
    }
  );
}

function notAuthorised(): ActionResult<never> {
  return {
    error: {
      code: "not_authorised",
      message: "Only owners and admins can resolve Xero person matches.",
    },
    ok: false,
  };
}

function unknownError(message: string): ActionResult<never> {
  return {
    error: {
      code: "unknown_error",
      message,
    },
    ok: false,
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid match resolution input.",
    },
    ok: false,
  };
}

async function isOrganisationMember(input: {
  clerkOrgId: string;
  clerkUserId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const clerk = await clerkClient();
    const memberships = await clerk.organizations.getOrganizationMembershipList(
      {
        organizationId: input.clerkOrgId,
        userId: [input.clerkUserId],
      }
    );
    if (memberships.data.length === 0) {
      return {
        message:
          "That user is not a member of this account. Invite them first, then link the person.",
        ok: false,
      };
    }
    return { ok: true };
  } catch (error) {
    log.error("Failed to verify Clerk organisation membership", {
      clerkOrgId: input.clerkOrgId,
      error,
    });
    return {
      message: "Could not verify that user right now. Try again shortly.",
      ok: false,
    };
  }
}
