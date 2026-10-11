import type { Result } from "@repo/core";
import { tenantTransaction } from "@repo/database";
import {
  listTeamsWithCoverageMinimum,
  setTeamCoverageMinimum,
  type TeamCoverageMinimumRow,
} from "@repo/database/queries/teams";
import { z } from "zod";

export type { TeamCoverageMinimumRow } from "@repo/database/queries/teams";

export type TeamCoverageMinimumError =
  | { code: "not_authorised"; message: string }
  | { code: "not_found"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface TeamCoverageMinimumReceipt {
  minimum: number | null;
  teamName: string;
}

export const TEAM_COVERAGE_MINIMUM_AUDIT_ACTION =
  "teams.coverage_minimum_updated";

const ScopeSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
});

const UpdateSchema = ScopeSchema.extend({
  actingRole: z.string(),
  actingUserId: z.string().min(1),
  minimum: z.number().nullable(),
  teamId: z.string().uuid(),
});

const failure = (
  code: TeamCoverageMinimumError["code"],
  message: string
): { ok: false; error: TeamCoverageMinimumError } => ({
  error: { code, message },
  ok: false,
});

const canManage = (role: string) => role === "owner" || role === "admin";

const rangeMessage = (teamSize: number) =>
  `Minimum must be between 0 and ${teamSize} ${teamSize === 1 ? "person" : "people"}.`;

/** Teams with their minimum and active headcount, for owners and admins. */
export async function listTeamCoverageMinimums(
  input: z.input<typeof ScopeSchema> & { actingRole: string }
): Promise<Result<TeamCoverageMinimumRow[], TeamCoverageMinimumError>> {
  if (!canManage(input.actingRole)) {
    return failure(
      "not_authorised",
      "Only owners and admins can manage coverage."
    );
  }
  const parsed = ScopeSchema.safeParse(input);
  if (!parsed.success) {
    return failure("validation_error", "Invalid organisation.");
  }
  const teams = await listTeamsWithCoverageMinimum(parsed.data);
  return teams.ok
    ? teams
    : failure("unknown_error", "Failed to load team coverage.");
}

/**
 * Sets or clears (null) a team's minimum people available on a working day.
 * The minimum must be a whole number from 0 to the team's active headcount.
 * The update and its audit event commit together.
 */
export async function updateTeamCoverageMinimum(
  input: z.input<typeof UpdateSchema>
): Promise<Result<TeamCoverageMinimumReceipt, TeamCoverageMinimumError>> {
  if (!canManage(input.actingRole)) {
    return failure(
      "not_authorised",
      "Only owners and admins can manage coverage."
    );
  }
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return failure(
      "validation_error",
      "Enter a whole number of people, or leave it blank."
    );
  }
  const value = parsed.data;
  try {
    const teams = await listTeamsWithCoverageMinimum(value);
    if (!teams.ok) {
      return failure("unknown_error", "Failed to update team coverage.");
    }
    const team = teams.value.find((row) => row.id === value.teamId);
    if (!team) {
      return failure("not_found", "That team was not found.");
    }
    if (
      value.minimum !== null &&
      !(
        Number.isInteger(value.minimum) &&
        value.minimum >= 0 &&
        value.minimum <= team.activePeopleCount
      )
    ) {
      return failure("validation_error", rangeMessage(team.activePeopleCount));
    }
    const { minimum } = value;
    const result = await tenantTransaction(input.clerkOrgId, async (tx) => {
      const change = await setTeamCoverageMinimum(
        {
          clerkOrgId: value.clerkOrgId,
          minimum,
          organisationId: value.organisationId,
          teamId: value.teamId,
        },
        tx
      );
      if (!change.ok) {
        return change;
      }
      await tx.auditEvent.create({
        data: {
          action: TEAM_COVERAGE_MINIMUM_AUDIT_ACTION,
          actor_user_id: value.actingUserId,
          after_value: { minimum: change.value.after },
          before_value: { minimum: change.value.before },
          clerk_org_id: value.clerkOrgId,
          entity_id: value.teamId,
          entity_type: "team",
          metadata: { actingUserId: value.actingUserId },
          organisation_id: value.organisationId,
          payload: { after: change.value.after, before: change.value.before },
          resource_id: value.teamId,
          resource_type: "team",
        },
      });
      return change;
    });
    if (!result.ok) {
      return result.error.code === "not_found"
        ? failure("not_found", "That team was not found.")
        : failure("unknown_error", "Failed to update team coverage.");
    }
    return {
      ok: true,
      value: { minimum, teamName: result.value.teamName },
    };
  } catch {
    return failure("unknown_error", "Failed to update team coverage.");
  }
}
