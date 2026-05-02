import { currentUser, requireOrg } from "@repo/auth/helpers";
import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { SupportSubmissionPayloadSchema } from "@repo/core";
import { getOrganisationById } from "@repo/database/src/queries";
import { log } from "@repo/observability/log";
import { z } from "zod";
import { createSupportGitHubIssue } from "@/lib/github/create-support-issue-service";
import { persistSupportSubmissionAudit } from "@/lib/support/persist-support-submission-audit";

const OrganisationQueryParamSchema = z.string().uuid();

type SupportGitHubIssueFailureCode =
  | "auth_error"
  | "configuration_error"
  | "forbidden"
  | "integration_error"
  | "unauthorised"
  | "validation_error";

interface SupportGitHubIssueFailureResponse {
  code: SupportGitHubIssueFailureCode;
  message: string;
  ok: false;
}

interface SupportGitHubIssueSuccessResponse {
  issueNumber: number;
  issueUrl: string;
  ok: true;
}

export async function POST(request: Request): Promise<Response> {
  try {
    let clerkOrgId: string;
    try {
      clerkOrgId = await requireOrg();
    } catch {
      return jsonFailure(401, "unauthorised", "Not authenticated");
    }

    const user = await currentUser();
    if (!user) {
      return jsonFailure(401, "unauthorised", "User not found");
    }

    const body = await request.json().catch(() => null);
    const parsedBody = SupportSubmissionPayloadSchema.safeParse(body);

    if (!parsedBody.success) {
      return jsonFailure(
        400,
        "validation_error",
        parsedBody.error.issues[0]?.message ?? "Invalid support submission."
      );
    }

    const pageUrl = new URL(parsedBody.data.page_url);
    const organisationContext = await resolveOrganisationContext(
      clerkOrgId,
      pageUrl
    );

    if (!organisationContext.ok) {
      return organisationContext.response;
    }

    const result = await createSupportGitHubIssue({
      payload: parsedBody.data,
      clerk_org_id: clerkOrgId,
      organisation_id: organisationContext.value?.organisationId,
      organisation_name: organisationContext.value?.organisationName,
      current_route: `${pageUrl.pathname}${pageUrl.search}`,
      environment: getRuntimeEnvironment(),
      user_id: user.id,
      user_email: getPrimaryEmail(user),
      user_name: getUserName(user),
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "validation_error":
          return jsonFailure(400, result.error.code, result.error.message);
        case "configuration_error":
        case "auth_error":
        case "integration_error":
          return jsonFailure(500, result.error.code, result.error.message);
        default:
          return unhandledSupportIssueError(result.error);
      }
    }

    if (organisationContext.value?.organisationId) {
      const auditResult = await persistSupportSubmissionAudit({
        category: parsedBody.data.category,
        clerkOrgId: clerkOrgId as ClerkOrgId,
        issueNumber: result.value.issueNumber,
        issueUrl: result.value.issueUrl,
        labelAssignmentSucceeded: result.value.labelAssignmentSucceeded,
        labelsAttempted: result.value.labelsAttempted,
        organisationId: organisationContext.value
          .organisationId as OrganisationId,
        status: "created",
        subject: parsedBody.data.subject,
        userId: user.id,
      });

      if (!auditResult.ok) {
        log.error("Failed to persist support submission audit event", {
          clerkOrgId,
          issueNumber: result.value.issueNumber,
          organisationId: organisationContext.value.organisationId,
          userId: user.id,
        });
      }
    }

    const response: SupportGitHubIssueSuccessResponse = {
      ok: true,
      issueNumber: result.value.issueNumber,
      issueUrl: result.value.issueUrl,
    };

    return Response.json(response);
  } catch (error) {
    log.error("Unexpected support GitHub issue route failure", { error });

    return jsonFailure(
      500,
      "integration_error",
      "Failed to create the GitHub issue."
    );
  }
}

async function resolveOrganisationContext(
  clerkOrgId: string,
  pageUrl: URL
): Promise<
  | {
      ok: true;
      value:
        | {
            organisationId: string;
            organisationName: string;
          }
        | undefined;
    }
  | {
      ok: false;
      response: Response;
    }
> {
  const organisationIdParam = pageUrl.searchParams.get("org");

  if (!organisationIdParam) {
    return { ok: true, value: undefined };
  }

  const parsedOrganisationId =
    OrganisationQueryParamSchema.safeParse(organisationIdParam);

  if (!parsedOrganisationId.success) {
    return {
      ok: false,
      response: jsonFailure(403, "forbidden", "Invalid organisation"),
    };
  }

  const organisationResult = await getOrganisationById(
    // Query helpers use branded IDs, this route derives the scoped raw values from Clerk auth and a validated UUID.
    clerkOrgId as ClerkOrgId,
    parsedOrganisationId.data as OrganisationId
  );

  if (!organisationResult.ok) {
    if (organisationResult.error.code === "not_found") {
      return {
        ok: false,
        response: jsonFailure(403, "forbidden", "Invalid organisation"),
      };
    }

    log.error("Failed to resolve support organisation context", {
      clerkOrgId,
      organisationId: parsedOrganisationId.data,
    });

    return {
      ok: false,
      response: jsonFailure(
        500,
        "integration_error",
        "Failed to resolve organisation context."
      ),
    };
  }

  return {
    ok: true,
    value: {
      organisationId: organisationResult.value.id,
      organisationName: organisationResult.value.name,
    },
  };
}

function getPrimaryEmail(
  user: Awaited<ReturnType<typeof currentUser>>
): string | undefined {
  return user?.emailAddresses[0]?.emailAddress;
}

function getUserName(
  user: NonNullable<Awaited<ReturnType<typeof currentUser>>>
): string | undefined {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return fullName || user.fullName || getPrimaryEmail(user);
}

function getRuntimeEnvironment(): string | undefined {
  if (process.env.NODE_ENV === "test") {
    return "test";
  }

  return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? undefined;
}

function jsonFailure(
  status: number,
  code: SupportGitHubIssueFailureCode,
  message: string
): Response {
  const response: SupportGitHubIssueFailureResponse = {
    ok: false,
    code,
    message,
  };

  return Response.json(response, { status });
}

function unhandledSupportIssueError(_error: never): Response {
  return jsonFailure(
    500,
    "integration_error",
    "Failed to create the GitHub issue."
  );
}
