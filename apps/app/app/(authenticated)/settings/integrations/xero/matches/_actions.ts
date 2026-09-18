"use server";

import { auth, clerkClient, currentUser } from "@repo/auth/server";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import { log } from "@repo/observability/log";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

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
type OrgContextValue = Extract<
  Awaited<ReturnType<typeof getActiveOrgContext>>,
  { ok: true }
>["value"];
type CallerUser = Exclude<Awaited<ReturnType<typeof currentUser>>, null>;
type MatchWithRelations = Exclude<Awaited<ReturnType<typeof loadMatch>>, null>;

export async function resolveXeroPersonMatchAction(input: {
  clerkUserId?: string;
  matchId: string;
  organisationId: string;
  resolution: "ignore" | "match";
}): Promise<ActionResult<{ resolved: true }>> {
  const parsed = ResolveMatchSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const caller = await resolveCallerContext(parsed.data.organisationId);
  if (!caller.ok) {
    return caller;
  }
  const { orgId, user, context } = caller.value;

  const match = await loadMatch(context, parsed.data.matchId);
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

  await applyResolution({
    context,
    match,
    parsed: parsed.data,
    resolvedClerkUserId: clerkUserId.value,
    user,
  });

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

  const context = await getActiveOrgContext(organisationId);
  if (!context.ok) {
    if (context.error.code === "unauthorised") {
      return notAuthorised();
    }
    if (context.error.code === "not_found") {
      return unknownError(
        "Organisation not found or not accessible in your context."
      );
    }
    return unknownError(context.error.message);
  }

  return { ok: true, value: { context: context.value, orgId, user } };
}

function loadMatch(context: OrgContextValue, matchId: string) {
  return database.xeroPersonMatch.findFirst({
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

  if (resolvedClerkUserId) {
    const alreadyLinked = await database.person.findFirst({
      select: { id: true },
      where: {
        clerk_org_id: orgId,
        clerk_user_id: resolvedClerkUserId,
        id: { not: match.xero_person.id },
        organisation_id: match.organisation_id,
      },
    });
    if (alreadyLinked) {
      return validationError(
        "That user is already linked to another person in this organisation."
      );
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
}): Promise<void> {
  const { context, match, parsed, resolvedClerkUserId, user } = args;

  await database.$transaction(async (tx) => {
    if (parsed.resolution === "match" && resolvedClerkUserId) {
      await tx.person.update({
        data: {
          clerk_user_id: resolvedClerkUserId,
        },
        where: { id: match.xero_person.id },
      });
    }

    await tx.xeroPersonMatch.update({
      data: {
        resolution_note:
          parsed.resolution === "ignore"
            ? "Marked as separate records by admin."
            : "Linked Xero person to Clerk user.",
        resolved_at: new Date(),
        resolved_by_user_id: user.id,
        resolved_clerk_user_id: resolvedClerkUserId,
        resolved_person_id: match.candidate_person?.id ?? null,
        status: parsed.resolution === "ignore" ? "ignored" : "matched",
      },
      where: { id: match.id },
    });

    await tx.auditEvent.create({
      data: {
        action:
          parsed.resolution === "ignore"
            ? "xero.person_match_ignored"
            : "xero.person_match_resolved",
        actor_display:
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.emailAddresses[0]?.emailAddress ||
          user.id,
        actor_user_id: user.id,
        clerk_org_id: context.clerkOrgId,
        entity_id: match.id,
        entity_type: "xero_person_match",
        metadata: {
          resolvedClerkUserId,
          xeroPersonId: match.xero_person.id,
        },
        organisation_id: match.organisation_id,
        resource_id: match.id,
        resource_type: "xero_person_match",
      },
    });
  });
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
