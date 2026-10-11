import "server-only";

import type {
  ClerkOrgId,
  OrganisationId,
  Result,
  SupportSubmissionCategory,
} from "@repo/core";
import { appError } from "@repo/core";
import { tenantDatabase } from "@repo/database";

export interface PersistSupportSubmissionAuditInput {
  category: SupportSubmissionCategory;
  clerkOrgId: ClerkOrgId;
  issueNumber: number;
  issueUrl: string;
  labelAssignmentSucceeded: boolean;
  labelsAttempted: readonly string[];
  organisationId: OrganisationId;
  status: "created";
  subject: string;
  userId: string;
}

export async function persistSupportSubmissionAudit(
  input: PersistSupportSubmissionAuditInput
): Promise<Result<void>> {
  try {
    const issueId = String(input.issueNumber);

    await tenantDatabase(input.clerkOrgId).auditEvent.create({
      data: {
        action: "support_submissions.github_issue_created",
        actor_user_id: input.userId,
        clerk_org_id: input.clerkOrgId,
        entity_id: issueId,
        entity_type: "support_submission",
        organisation_id: input.organisationId,
        payload: {
          category: input.category,
          issueNumber: input.issueNumber,
          issueUrl: input.issueUrl,
          labelAssignmentSucceeded: input.labelAssignmentSucceeded,
          labelsAttempted: [...input.labelsAttempted],
          status: input.status,
          subject: input.subject,
        },
        resource_id: issueId,
        resource_type: "support_submission",
      },
    });

    return {
      ok: true,
      value: undefined,
    };
  } catch {
    return {
      error: appError("internal", "Failed to persist the support audit event."),
      ok: false,
    };
  }
}
