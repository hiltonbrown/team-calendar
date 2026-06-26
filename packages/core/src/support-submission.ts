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

export const SupportSubmissionPayloadSchema = z.object({
  category: SupportSubmissionCategorySchema,
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required.")
    .max(256, "Subject must be 256 characters or fewer."),
  message: z
    .string()
    .trim()
    .min(1, "Message is required.")
    .max(10_000, "Message must be 10000 characters or fewer."),
  priority: SupportSubmissionPrioritySchema,
  page_url: z.string().url(),
  email_override: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().email().optional()),
  reproduction_steps: optionalTrimmedString(),
  expected_outcome: optionalTrimmedString(),
  actual_outcome: optionalTrimmedString(),
});

export const SupportSubmissionContextSchema = z.object({
  clerk_org_id: optionalTrimmedString(),
  organisation_id: optionalTrimmedString(),
  organisation_name: optionalTrimmedString(),
  user_id: optionalTrimmedString(),
  user_email: optionalTrimmedString(),
  user_name: optionalTrimmedString(),
  current_route: optionalTrimmedString(),
  environment: optionalTrimmedString(),
  app_version: optionalTrimmedString(),
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

export function buildSupportIssueTitle(
  input: Pick<SupportSubmissionPayload, "category" | "subject">
): string {
  const prefix = input.category === "support" ? "[Support]" : "[Feedback]";

  return `${prefix} ${input.subject}`;
}

export function buildSupportIssueMarkdownBody(
  input: SupportSubmissionIssueInput
): string {
  const sections = [
    "## Summary",
    `**Subject:** ${input.subject}`,
    "",
    input.message,
    "",
    "## Metadata",
    ...buildMetadataLines(input),
  ];

  if (input.reproduction_steps) {
    sections.push("", "## Reproduction steps", input.reproduction_steps);
  }

  if (input.expected_outcome) {
    sections.push("", "## Expected outcome", input.expected_outcome);
  }

  if (input.actual_outcome) {
    sections.push("", "## Actual outcome", input.actual_outcome);
  }

  sections.push("", "## Internal notes", INTERNAL_NOTES_PLACEHOLDER);

  return sections.join("\n");
}

export function getSupportIssueLabels(
  input: Pick<SupportSubmissionPayload, "category" | "priority">
): readonly [string, string] {
  return [input.category, `priority:${input.priority}`] as const;
}

function buildMetadataLines(input: SupportSubmissionIssueInput): string[] {
  const rows: [label: string, value: string | undefined][] = [
    ["Category", CATEGORY_LABELS[input.category]],
    ["Priority", PRIORITY_LABELS[input.priority]],
    ["Page URL", input.page_url],
    ["Email override", input.email_override],
    ["Current route", input.current_route],
    ["Clerk organisation ID", input.clerk_org_id],
    ["Organisation ID", input.organisation_id],
    ["Organisation name", input.organisation_name],
    ["User ID", input.user_id],
    ["User email", input.user_email],
    ["User name", input.user_name],
    ["Environment", input.environment],
    ["App version", input.app_version],
  ];

  return rows
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => `- ${label}: ${value}`);
}
