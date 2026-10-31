import { resend } from "./client";
import { keys } from "./keys";

export interface SendAuthEmailInput {
  readonly actionLabel: string;
  readonly actionUrl: string;
  readonly body: string;
  readonly subject: string;
  readonly to: string;
}

export const sendAuthEmail = async (
  input: SendAuthEmailInput
): Promise<void> => {
  const { RESEND_FROM } = keys();
  if (!(resend && RESEND_FROM)) {
    throw new Error("Auth email transport is not configured");
  }
  try {
    const { data, error } = await resend.emails.send({
      from: RESEND_FROM,
      subject: input.subject,
      text: `${input.body}\n\n${input.actionLabel}: ${input.actionUrl}\n\nIf you did not request this, you can ignore this email.`,
      to: input.to,
    });
    if (error || !data) {
      throw new Error("Auth email delivery failed");
    }
  } catch {
    // Provider diagnostics may include the one-time link. Keep failures generic.
    // biome-ignore lint/style/useErrorCause: Provider exceptions can contain secret one-time URLs and must not be retained in logged causes.
    throw new Error("Auth email delivery failed");
  }
};
