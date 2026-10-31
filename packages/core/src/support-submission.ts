import { z } from "zod";

export const SupportSubmissionCategorySchema = z.enum(["support", "feedback"]);

export const SupportSubmissionPrioritySchema = z.enum([
  "low",
  "normal",
  "high",
]);

const optionalTrimmedString = () =>
  z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().optional());

export const MAX_ISSUE_TITLE_LENGTH = 256;
export const MAX_SUBJECT_LENGTH = 256;
export const MAX_MESSAGE_LENGTH = 10_000;
export const MAX_REPRODUCTION_STEPS_LENGTH = 10_000;
export const MAX_EXPECTED_OUTCOME_LENGTH = 5000;
export const MAX_ACTUAL_OUTCOME_LENGTH = 5000;

export const SupportSubmissionPayloadSchema = z.object({
  actual_outcome: optionalTrimmedString(),
  category: SupportSubmissionCategorySchema,
  email_override: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().email().optional()),
  expected_outcome: optionalTrimmedString(),
  message: z
    .string()
    .trim()
    .min(1, "Message is required.")
    .max(
      MAX_MESSAGE_LENGTH,
      `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`
    ),
  page_url: z.string().url(),
  priority: SupportSubmissionPrioritySchema,
  reproduction_steps: optionalTrimmedString(),
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required.")
    .max(
      MAX_SUBJECT_LENGTH,
      `Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`
    ),
});

export const SupportSubmissionContextSchema = z.object({
  account_id: optionalTrimmedString(),
  app_version: optionalTrimmedString(),
  current_route: optionalTrimmedString(),
  environment: optionalTrimmedString(),
  organisation_id: optionalTrimmedString(),
  organisation_name: optionalTrimmedString(),
  user_email: optionalTrimmedString(),
  user_id: optionalTrimmedString(),
  user_name: optionalTrimmedString(),
});

export const SupportSubmissionIssueInputSchema =
  SupportSubmissionPayloadSchema.extend(SupportSubmissionContextSchema.shape);

export type SupportSubmissionCategory = z.infer<
  typeof SupportSubmissionCategorySchema
>;
export type SupportSubmissionPriority = z.infer<
  typeof SupportSubmissionPrioritySchema
>;
export type SupportSubmissionPayload = z.infer<
  typeof SupportSubmissionPayloadSchema
>;
export type SupportSubmissionContext = z.infer<
  typeof SupportSubmissionContextSchema
>;
export type SupportSubmissionIssueInput = z.infer<
  typeof SupportSubmissionIssueInputSchema
>;

const CATEGORY_LABELS: Record<SupportSubmissionCategory, string> = {
  feedback: "Feedback",
  support: "Support",
};

const PRIORITY_LABELS: Record<SupportSubmissionPriority, string> = {
  high: "High",
  low: "Low",
  normal: "Normal",
};

const INTERNAL_NOTES_PLACEHOLDER = [
  "Submitted from Team Calendar support form.",
  "",
  "Complete triage notes here.",
].join("\n");

export function sanitizeTitleText(
  text: string,
  maxLength = MAX_SUBJECT_LENGTH
): string {
  const cleaned = text
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "Untitled";
  }

  return cleaned.slice(0, maxLength).trim();
}

export function buildSupportIssueTitle(
  input: Pick<SupportSubmissionPayload, "category" | "subject">
): string {
  const prefix = input.category === "support" ? "[Support]" : "[Feedback]";
  const maxSubjectLen = MAX_ISSUE_TITLE_LENGTH - prefix.length - 1;
  const sanitizedSubject = sanitizeTitleText(input.subject, maxSubjectLen);

  return `${prefix} ${sanitizedSubject}`;
}

export function createDynamicCodeFence(
  content: string,
  tag = "untrusted-user-text"
): { close: string; open: string } {
  const backtickMatches = content.match(/`+/g);
  let maxBackticks = 0;
  if (backtickMatches) {
    for (const match of backtickMatches) {
      if (match.length > maxBackticks) {
        maxBackticks = match.length;
      }
    }
  }
  const fenceLength = Math.max(3, maxBackticks + 1);
  const fence = "`".repeat(fenceLength);
  return {
    close: fence,
    open: tag ? `${fence}${tag}` : fence,
  };
}

export function wrapUntrustedContent(
  content: string,
  maxLength: number,
  tag = "untrusted-user-text"
): string {
  const bounded = content.slice(0, maxLength);
  const { open, close } = createDynamicCodeFence(bounded, tag);
  return `${open}\n${bounded}\n${close}`;
}

function sanitizeMetadataValue(value: string): string {
  return value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMetadataLines(input: SupportSubmissionIssueInput): string[] {
  const rows: [label: string, value: string | undefined][] = [
    ["Category", CATEGORY_LABELS[input.category]],
    ["Priority", PRIORITY_LABELS[input.priority]],
    ["Account ID", input.account_id],
    ["Organisation ID", input.organisation_id],
    ["User ID", input.user_id],
    ["Current route", input.current_route],
    ["Page URL", input.page_url],
    ["Environment", input.environment],
    ["App version", input.app_version],
  ];

  return rows
    .filter(
      (row): row is [label: string, value: string] =>
        row[1] !== undefined && row[1].trim() !== ""
    )
    .map(([label, value]) => `- ${label}: ${sanitizeMetadataValue(value)}`);
}

export function buildSupportIssueMarkdownBody(
  input: SupportSubmissionIssueInput
): string {
  const sections: string[] = [
    "## Metadata",
    ...buildMetadataLines(input),
    "",
    "## Untrusted user content",
    "",
    "### Subject (untrusted)",
    wrapUntrustedContent(input.subject, MAX_SUBJECT_LENGTH),
    "",
    "### Message (untrusted)",
    wrapUntrustedContent(input.message, MAX_MESSAGE_LENGTH),
  ];

  if (input.reproduction_steps) {
    sections.push(
      "",
      "### Reproduction steps (untrusted)",
      wrapUntrustedContent(
        input.reproduction_steps,
        MAX_REPRODUCTION_STEPS_LENGTH
      )
    );
  }

  if (input.expected_outcome) {
    sections.push(
      "",
      "### Expected outcome (untrusted)",
      wrapUntrustedContent(input.expected_outcome, MAX_EXPECTED_OUTCOME_LENGTH)
    );
  }

  if (input.actual_outcome) {
    sections.push(
      "",
      "### Actual outcome (untrusted)",
      wrapUntrustedContent(input.actual_outcome, MAX_ACTUAL_OUTCOME_LENGTH)
    );
  }

  sections.push("", "## Internal notes", INTERNAL_NOTES_PLACEHOLDER);

  return sections.join("\n");
}

export function getSupportIssueLabels(
  input: Pick<SupportSubmissionPayload, "category" | "priority">
): readonly [string, string] {
  return [input.category, `priority:${input.priority}`] as const;
}

export interface SupportIssuePayload {
  body: string;
  labels: readonly [string, string];
  title: string;
}

export function buildSupportIssuePayload(
  input: SupportSubmissionIssueInput
): SupportIssuePayload {
  return {
    body: buildSupportIssueMarkdownBody(input),
    labels: getSupportIssueLabels(input),
    title: buildSupportIssueTitle(input),
  };
}
