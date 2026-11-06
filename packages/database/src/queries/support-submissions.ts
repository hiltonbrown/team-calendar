import {
  type AccountId,
  appError,
  type OrganisationId,
  type Result,
  SupportSubmissionCategorySchema,
} from "@repo/core";
import { z } from "zod";
import { assertTenantDb, type TenantDb } from "../tenant-db";
import { scopedQuery } from "../tenant-query";

const SupportSubmissionAuditPayloadSchema = z.object({
  category: SupportSubmissionCategorySchema,
  issueNumber: z.number().int().positive(),
  issueUrl: z.string().url(),
  labelAssignmentSucceeded: z.boolean().optional(),
  labelsAttempted: z.array(z.string()).optional(),
  status: z.string().min(1),
  subject: z.string().min(1),
});

export interface SupportSubmissionAuditData {
  accountId: string;
  actorUserId: string | null;
  category: z.infer<typeof SupportSubmissionCategorySchema>;
  createdAt: Date;
  id: string;
  issueNumber: number;
  issueUrl: string;
  labelAssignmentSucceeded: boolean;
  labelsAttempted: string[];
  organisationId: OrganisationId;
  status: string;
  subject: string;
}

export async function listRecentSupportSubmissionAudits(
  accountId: AccountId,
  organisationId: OrganisationId,
  limit: number | undefined,
  db: TenantDb
): Promise<Result<SupportSubmissionAuditData[]>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb = db;

    try {
      const auditEvents = await tenantDb.auditEvent.findMany({
        orderBy: { created_at: "desc" },
        select: {
          account_id: true,
          action: true,
          actor_user_id: true,
          created_at: true,
          id: true,
          organisation_id: true,
          payload: true,
        },
        take: limit ?? 20,
        where: {
          ...scopedQuery(accountId, organisationId),
          action: "support_submissions.github_issue_created",
        },
      });

      return {
        ok: true,
        value: auditEvents.flatMap((event) => {
          const parsedPayload = SupportSubmissionAuditPayloadSchema.safeParse(
            event.payload
          );

          if (!parsedPayload.success) {
            return [];
          }

          return [
            {
              accountId: event.account_id,
              actorUserId: event.actor_user_id,
              category: parsedPayload.data.category,
              createdAt: event.created_at,
              id: event.id,
              issueNumber: parsedPayload.data.issueNumber,
              issueUrl: parsedPayload.data.issueUrl,
              labelAssignmentSucceeded:
                parsedPayload.data.labelAssignmentSucceeded ?? false,
              labelsAttempted: parsedPayload.data.labelsAttempted ?? [],
              organisationId: event.organisation_id as OrganisationId,
              status: parsedPayload.data.status,
              subject: parsedPayload.data.subject,
            },
          ];
        }),
      };
    } catch (error) {
      if (tenantDb) {
        throw error;
      }
      return {
        error: appError(
          "internal",
          "Failed to list support submission audit events"
        ),
        ok: false,
      };
    }
  }
}
