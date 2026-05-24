import {
  appError,
  type ClerkOrgId,
  type OrganisationId,
  type Result,
  SupportSubmissionCategorySchema,
} from "@repo/core";
import { z } from "zod";
import { database } from "../client";
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
  actorUserId: string | null;
  category: z.infer<typeof SupportSubmissionCategorySchema>;
  clerkOrgId: string;
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
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  limit?: number
): Promise<Result<SupportSubmissionAuditData[]>> {
  try {
    const auditEvents = await database.auditEvent.findMany({
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        action: "support_submissions.github_issue_created",
      },
      select: {
        action: true,
        actor_user_id: true,
        clerk_org_id: true,
        created_at: true,
        id: true,
        organisation_id: true,
        payload: true,
      },
      orderBy: { created_at: "desc" },
      take: limit ?? 20,
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
            actorUserId: event.actor_user_id,
            category: parsedPayload.data.category,
            clerkOrgId: event.clerk_org_id,
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
  } catch {
    return {
      ok: false,
      error: appError(
        "internal",
        "Failed to list support submission audit events"
      ),
    };
  }
}
