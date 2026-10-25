import "server-only";

import type {
  AccountId,
  OrganisationId,
  Result,
  SupportSubmissionCategory,
} from "@repo/core";
import { assertTenantDb, type TenantDb } from "@repo/database";

export interface PersistSupportSubmissionAuditInput {
  accountId: AccountId;
  category: SupportSubmissionCategory;
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
  input: PersistSupportSubmissionAuditInput,
  db: TenantDb
): Promise<Result<void>> {
  assertTenantDb(db, input.accountId);
  const issueId = String(input.issueNumber);

  await db.auditEvent.create({
    data: {
      account_id: input.accountId,
      action: "support_submissions.github_issue_created",
      actor_user_id: input.userId,
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
}
