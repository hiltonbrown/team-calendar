import "server-only";

import { log } from "@repo/observability/log";
import { z } from "zod";
import {
  buildSupportIssuePayload,
  type Result,
  type SupportSubmissionContext,
  SupportSubmissionIssueInputSchema,
} from "./build-support-issue-payload";
import { keys } from "./keys";

const GITHUB_API_ORIGIN = "https://api.github.com";

const GitHubIssueResponseSchema = z.object({
  html_url: z.string().url(),
  number: z.number().int().positive(),
  title: z.string().min(1),
});

export type CreateSupportGitHubIssueError =
  | { code: "configuration_error"; message: string }
  | { code: "validation_error"; message: string }
  | { code: "auth_error"; message: string }
  | { code: "integration_error"; message: string };

export interface CreateSupportGitHubIssueResult {
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  labelAssignmentSucceeded: boolean;
  labelsAttempted: readonly string[];
}

export type CreateSupportGitHubIssueInput = {
  payload: unknown;
} & SupportSubmissionContext;

interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
}

export async function createSupportGitHubIssue(
  input: CreateSupportGitHubIssueInput
): Promise<
  Result<CreateSupportGitHubIssueResult, CreateSupportGitHubIssueError>
> {
  const config = resolveGitHubConfig();
  if (!config.ok) {
    return config;
  }

  const parsedInput = SupportSubmissionIssueInputSchema.safeParse(
    mergePayloadWithContext(input)
  );

  if (!parsedInput.success) {
    return {
      error: {
        code: "validation_error",
        message:
          parsedInput.error.issues[0]?.message ?? "Invalid support submission.",
      },
      ok: false,
    };
  }

  const { title, body, labels } = buildSupportIssuePayload(parsedInput.data);

  try {
    const issueResult = await createIssue(config.value, { body, title });
    if (!issueResult.ok) {
      return issueResult;
    }

    const labelAssignmentSucceeded = await assignLabelsBestEffort(
      config.value,
      {
        issueNumber: issueResult.value.issueNumber,
        labels: [...labels],
      }
    );

    return {
      ok: true,
      value: {
        issueNumber: issueResult.value.issueNumber,
        issueTitle: issueResult.value.issueTitle,
        issueUrl: issueResult.value.issueUrl,
        labelAssignmentSucceeded,
        labelsAttempted: labels,
      },
    };
  } catch (error) {
    log.error("Unexpected GitHub issue creation failure", {
      error,
      owner: config.value.owner,
      repo: config.value.repo,
    });

    return {
      error: {
        code: "integration_error",
        message: "Failed to create the GitHub issue.",
      },
      ok: false,
    };
  }
}

function resolveGitHubConfig(): Result<
  GitHubConfig,
  CreateSupportGitHubIssueError
> {
  const env = keys();

  if (!(env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO)) {
    return {
      error: {
        code: "configuration_error",
        message: "GitHub issue integration is not configured.",
      },
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      token: env.GITHUB_TOKEN,
    },
  };
}

function mergePayloadWithContext(
  input: CreateSupportGitHubIssueInput
): Record<string, unknown> {
  const payload =
    input.payload &&
    typeof input.payload === "object" &&
    !Array.isArray(input.payload)
      ? input.payload
      : {};

  return {
    ...payload,
    account_id: input.account_id,
    app_version: input.app_version,
    current_route: input.current_route,
    environment: input.environment,
    organisation_id: input.organisation_id,
    user_id: input.user_id,
  };
}

function buildGitHubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function createIssue(
  config: GitHubConfig,
  input: { body: string; title: string }
): Promise<
  Result<
    { issueNumber: number; issueTitle: string; issueUrl: string },
    CreateSupportGitHubIssueError
  >
> {
  const response = await fetch(
    `${GITHUB_API_ORIGIN}/repos/${config.owner}/${config.repo}/issues`,
    {
      body: JSON.stringify({
        body: input.body,
        title: input.title,
      }),
      headers: buildGitHubHeaders(config.token),
      method: "POST",
    }
  );

  if (!response.ok) {
    return {
      error: mapGitHubFailure(response.status),
      ok: false,
    };
  }

  const payload = await response.json();
  const parsed = GitHubIssueResponseSchema.safeParse(payload);

  if (!parsed.success) {
    log.error("GitHub issue creation returned an invalid response", {
      owner: config.owner,
      repo: config.repo,
    });

    return {
      error: {
        code: "integration_error",
        message: "GitHub issue creation failed.",
      },
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      issueNumber: parsed.data.number,
      issueTitle: parsed.data.title,
      issueUrl: parsed.data.html_url,
    },
  };
}

async function assignLabelsBestEffort(
  config: GitHubConfig,
  input: { issueNumber: number; labels: readonly string[] }
): Promise<boolean> {
  const response = await fetch(
    `${GITHUB_API_ORIGIN}/repos/${config.owner}/${config.repo}/issues/${input.issueNumber}/labels`,
    {
      body: JSON.stringify({ labels: input.labels }),
      headers: buildGitHubHeaders(config.token),
      method: "POST",
    }
  ).catch((error: unknown) => {
    log.warn("GitHub label assignment request failed", {
      error,
      issueNumber: input.issueNumber,
      labels: input.labels,
      owner: config.owner,
      repo: config.repo,
    });

    return null;
  });

  if (!response) {
    return false;
  }

  if (response.ok) {
    return true;
  }

  log.warn("GitHub label assignment failed", {
    issueNumber: input.issueNumber,
    labels: input.labels,
    owner: config.owner,
    repo: config.repo,
    status: response.status,
  });

  return false;
}

function mapGitHubFailure(status: number): CreateSupportGitHubIssueError {
  if (status === 401 || status === 403) {
    return {
      code: "auth_error",
      message: "GitHub authentication failed.",
    };
  }

  return {
    code: "integration_error",
    message: "GitHub issue creation failed.",
  };
}
