"use server";

import { listAccountMembers } from "@repo/auth/accounts";
import { hasPermission } from "@repo/auth/helpers";
import { hasPermission as can } from "@repo/auth/permissions";
import { getCurrentUser, getSession } from "@repo/auth/server";
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
  matchId: z.string().uuid(),
  organisationId: z.string().uuid(),
  resolution: z.enum(["ignore", "match"]),
  userId: z.string().trim().startsWith("user_").optional(),
});

type ActionError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

type ParsedInput = z.infer<typeof ResolveMatchSchema>;
interface OrgContextValue {
  accountId: string;
  organisationId: string;
}
type CallerUser = Exclude<Awaited<ReturnType<typeof getCurrentUser>>, null>;
type MatchWithRelations = Exclude<Awaited<ReturnType<typeof loadMatch>>, null>;

export async function resolveXeroPersonMatchAction(input: {
  userId?: string;
  matchId: string;
  organisationId: string;
  resolution: "ignore" | "match";
}): Promise<ActionResult<{ resolved: true }>> {
  assertNoTenantTransaction("resolveXeroPersonMatchAction");
  const [admin, owner] = await Promise.all([
    hasPermission({ xero: ["manage"] }),
    hasPermission({ ownership: ["manage"] }),
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
  const { accountId: sessionAccountId, user, context } = caller.value;

  const match = await withTenantDb(sessionAccountId, async (db) => {
    const company = await db.organisation.findFirst({
      select: { id: true },
      where: { account_id: sessionAccountId, id: context.organisationId },
    });
    return company ? loadMatch(context, parsed.data.matchId, db) : null;
  });
  if (!match) {
    return unknownError("Possible match not found.");
  }

  const userId = await resolveUserId({
    accountId: sessionAccountId,
    match,
    parsed: parsed.data,
  });
  if (!userId.ok) {
    return userId;
  }

  const applied = await applyResolution({
    context,
    match,
    parsed: parsed.data,
    resolvedUserId: userId.value,
    user,
  });
  if (!applied.ok) {
    return applied;
  }

  revalidatePath("/settings/integrations/xero/matches");
  return { ok: true, value: { resolved: true } };
}

async function resolveCallerContext(organisationId: string): Promise<
  ActionResult<{
    context: OrgContextValue;
    accountId: string;
    user: CallerUser;
  }>
> {
  const [{ accountId: sessionAccountId, role: sessionRole }, user] =
    await Promise.all([
      getSession().then(
        (currentSession) =>
          currentSession ?? {
            accountId: null,
            role: null,
            sessionId: null,
            userId: null,
          }
      ),
      getCurrentUser(),
    ]);
  if (!(sessionAccountId && user && can(sessionRole, { xero: ["manage"] }))) {
    return notAuthorised();
  }

  return {
    ok: true,
    value: {
      accountId: sessionAccountId,
      context: { accountId: sessionAccountId, organisationId },
      user,
    },
  };
}

function loadMatch(context: OrgContextValue, matchId: string, db: TenantDb) {
  return db.xeroPersonMatch.findFirst({
    include: {
      candidate_person: {
        select: {
          id: true,
          user_id: true,
        },
      },
      xero_person: {
        select: {
          id: true,
        },
      },
    },
    where: {
      // Both tenant keys: one Account can own several Organisation
      // rows (one per Xero file), so account_id alone spans payroll entities.
      account_id: context.accountId,
      id: matchId,
      organisation_id: context.organisationId,
    },
  });
}

async function resolveUserId(args: {
  match: MatchWithRelations;
  accountId: string;
  parsed: ParsedInput;
}): Promise<ActionResult<string | null>> {
  const { match, accountId: sessionAccountId, parsed } = args;
  const resolvedUserId =
    parsed.resolution === "match"
      ? (parsed.userId ?? match.candidate_person?.user_id ?? null)
      : null;
  if (parsed.resolution === "match" && !resolvedUserId) {
    return validationError(
      "Enter the user ID to link, or create a candidate person with a linked user first."
    );
  }

  if (parsed.resolution === "match" && parsed.userId) {
    const membership = await isOrganisationMember({
      accountId: sessionAccountId,
      userId: parsed.userId,
    });
    if (!membership.ok) {
      return validationError(membership.message);
    }
  }

  return { ok: true, value: resolvedUserId };
}

async function applyResolution(args: {
  context: OrgContextValue;
  match: MatchWithRelations;
  parsed: ParsedInput;
  resolvedUserId: string | null;
  user: CallerUser;
}): Promise<ActionResult<void>> {
  const { context, parsed, resolvedUserId, user } = args;
  return await withTenantResult(
    context.accountId,
    async (db): Promise<ActionResult<void>> => {
      const company = await db.organisation.findFirst({
        select: { id: true },
        where: { account_id: context.accountId, id: context.organisationId },
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

      const actorDisplay = user.name || user.email || user.id;

      if (parsed.resolution === "match") {
        const result = await mergeCandidateIntoXeroPerson(
          {
            accountId: context.accountId,
            organisationId: context.organisationId,
          },
          {
            accountId: context.accountId,
            actorDisplay,
            actorUserId: user.id,
            candidatePersonId: match.candidate_person?.id ?? null,
            matchId: match.id,
            organisationId: match.organisation_id,
            userId: resolvedUserId,
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
            accountId: context.accountId,
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
  accountId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const memberships = await listAccountMembers({
      accountId: input.accountId,
      userIds: [input.userId],
    });
    if (memberships.data.length === 0) {
      return {
        message:
          "That user is not a member of this account. Invite them first, then link the person.",
        ok: false,
      };
    }
    return { ok: true };
  } catch (error) {
    log.error("Failed to verify Account membership", {
      accountId: input.accountId,
      error,
    });
    return {
      message: "Could not verify that user right now. Try again shortly.",
      ok: false,
    };
  }
}
