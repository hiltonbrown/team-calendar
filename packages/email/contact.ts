import { resend } from "./client";
import { keys } from "./keys";

export interface ContactMessage {
  readonly browser?: string;
  readonly calendarClient?: string;
  readonly companySize?: string;
  readonly country?: string;
  readonly email: string;
  readonly heardFrom?: string;
  readonly message: string;
  readonly name: string;
  readonly organisation?: string;
  readonly pageUrl?: string;
  readonly steps?: string;
  readonly type: "enquiry" | "early-access" | "support" | "bug";
  readonly usesXeroPayroll?: string;
}

const labels = {
  bug: "Bug report",
  "early-access": "AU early access application",
  enquiry: "General enquiry",
  support: "Support enquiry",
};

export async function sendContactEmail(input: {
  readonly message: ContactMessage;
  readonly reference: string;
  readonly idempotencyKey: string;
  readonly to: string;
  readonly confirmation?: boolean;
}): Promise<
  { ok: true; value: { id: string } } | { ok: false; error: string }
> {
  const { RESEND_FROM } = keys();
  if (!(resend && RESEND_FROM)) {
    return { error: "Resend transport is not configured", ok: false };
  }
  const subject = input.confirmation
    ? `We received your message: ${input.reference}`
    : `${labels[input.message.type]}: ${input.reference}`;
  // Receipts contain fixed copy only: this public form must not relay arbitrary
  // user-supplied content to an unverified recipient.
  const text = input.confirmation
    ? `Thank you for contacting Team Calendar. Your message has been received.\n\nReference: ${input.reference}\n\nAn early access application is an expression of interest, not confirmation of admission.\n\nIf you did not contact Team Calendar, you can ignore this email.`
    : [
        `${labels[input.message.type]} (${input.reference})`,
        ...Object.entries(input.message).map(
          ([key, value]) => `${key}: ${value}`
        ),
      ].join("\n\n");
  try {
    const { data, error } = await resend.emails.send(
      {
        from: RESEND_FROM,
        ...(input.confirmation ? {} : { replyTo: input.message.email }),
        subject,
        text,
        to: input.to,
      },
      { idempotencyKey: input.idempotencyKey }
    );
    return error || !data
      ? { error: error?.message ?? "No email ID returned", ok: false }
      : { ok: true, value: { id: data.id } };
  } catch {
    return { error: "Email delivery is temporarily unavailable", ok: false };
  }
}
