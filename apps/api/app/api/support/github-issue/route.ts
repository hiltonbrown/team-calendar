import { getCurrentUser, requireAccount } from "@repo/auth/helpers";
import type { AccountId, OrganisationId } from "@repo/core";
import { SupportSubmissionPayloadSchema } from "@repo/core";
import { withTenantResult } from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { log } from "@repo/observability/log";
import { z } from "zod";
import { createSupportGitHubIssue } from "@/lib/github/create-support-issue-service";
import { checkSupportRateLimit } from "@/lib/rate-limit/support-rate-limit";
import { persistSupportSubmissionAudit } from "@/lib/support/persist-support-submission-audit";

const OrganisationQueryParamSchema = z.string().uuid();

type SupportGitHubIssueFailureCode =
  | "auth_error"
  | "configuration_error"
  | "forbidden"
  | "integration_error"
  | "rate_limit"
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
  assertNoTenantTransaction("POST");
  try {
    let accountId: string;
    try {
      accountId = await requireAccount();
    } catch {
      return jsonFailure(401, "unauthorised", "Not authenticated");
    }

    const user = await getCurrentUser();
    if (!user) {
      return jsonFailure(401, "unauthorised", "User not found");
    }

    const rateLimitResult = await checkSupportRateLimit({
      accountId,
      userId: user.id,
    });

    if (!rateLimitResult.allowed) {
      return jsonFailure(
        429,
        "rate_limit",
        "Too many support requests. Try again later.",
        {
          "Retry-After": String(rateLimitResult.retryAfter ?? 15 * 60),
        }
      );
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
      accountId,
      pageUrl
    );

    if (!organisationContext.ok) {
      return organisationContext.response;
    }

    const result = await createSupportGitHubIssue({
      account_id: accountId,
      current_route: `${pageUrl.pathname}${pageUrl.search}`,
      environment: getRuntimeEnvironment(),
      organisation_id: organisationContext.value?.organisationId,
      payload: parsedBody.data,
      user_id: user.id,
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
      const phaseInput1 = {
        accountId: accountId as AccountId,
        category: parsedBody.data.category,
        issueNumber: result.value.issueNumber,
        issueUrl: result.value.issueUrl,
        labelAssignmentSucceeded: result.value.labelAssignmentSucceeded,
        labelsAttempted: result.value.labelsAttempted,
        organisationId: organisationContext.value
          .organisationId as OrganisationId,
        status: "created",
        subject: parsedBody.data.subject,
        userId: user.id,
      } satisfies Parameters<typeof persistSupportSubmissionAudit>[0];
      // The issue already exists, so an audit failure is logged, never surfaced.
      const auditResult = await withTenantResult(phaseInput1.accountId, (db) =>
        persistSupportSubmissionAudit(phaseInput1, db)
      ).catch((error: unknown) => ({ error, ok: false as const }));

      if (!auditResult.ok) {
        log.error("Failed to persist support submission audit event", {
          accountId,
          error: auditResult.error,
          issueNumber: result.value.issueNumber,
          organisationId: organisationContext.value.organisationId,
          userId: user.id,
        });
      }
    }

    const response: SupportGitHubIssueSuccessResponse = {
      issueNumber: result.value.issueNumber,
      issueUrl: result.value.issueUrl,
      ok: true,
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
  accountId: string,
  pageUrl: URL
): Promise<
  | {
      ok: true;
      value:
        | {
            organisationId: string;
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

  const organisationResult = await withTenantResult(
    accountId as AccountId,
    (db) =>
      getOrganisationById(
        accountId as AccountId,
        parsedOrganisationId.data as OrganisationId,
        db
      )
  );

  if (!organisationResult.ok) {
    if (organisationResult.error.code === "not_found") {
      return {
        ok: false,
        response: jsonFailure(403, "forbidden", "Invalid organisation"),
      };
    }

    log.error("Failed to resolve support organisation context", {
      accountId,
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
    },
  };
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
  message: string,
  headers?: HeadersInit
): Response {
  const response: SupportGitHubIssueFailureResponse = {
    code,
    message,
    ok: false,
  };

  return Response.json(response, { headers, status });
}

function unhandledSupportIssueError(_error: never): Response {
  return jsonFailure(
    500,
    "integration_error",
    "Failed to create the GitHub issue."
  );
}
