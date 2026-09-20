import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { resend } from "./client";
import { keys } from "./keys";

export { resend } from "./client";

export interface SendNotificationEmailInput {
  readonly actionUrl: string | null;
  readonly body: string;
  readonly idempotencyKey: string;
  readonly title: string;
  readonly to: string;
  readonly unsubscribeUrl: string;
}

export type SendNotificationEmailResult =
  | { ok: true; value: { id: string } }
  | { ok: false; error: string };

interface NotificationEmailTemplateProps {
  readonly actionUrl: string | null;
  readonly body: string;
  readonly title: string;
  readonly unsubscribeUrl: string;
}

interface NotificationEmailTemplateModule {
  readonly NotificationEmailTemplate: (
    props: NotificationEmailTemplateProps
  ) => ReactElement;
}

export async function sendNotificationEmail(
  input: SendNotificationEmailInput
): Promise<SendNotificationEmailResult> {
  const { RESEND_FROM } = keys();
  if (!(resend && RESEND_FROM)) {
    return { error: "Resend transport is not configured", ok: false };
  }

  // Keep the TSX template out of non-JSX workspace typecheck graphs.
  const notificationTemplate: NotificationEmailTemplateModule = require("./templates/notification");
  const html = await render(
    notificationTemplate.NotificationEmailTemplate({
      actionUrl: input.actionUrl,
      body: input.body,
      title: input.title,
      unsubscribeUrl: input.unsubscribeUrl,
    })
  );
  const { data, error } = await resend.emails.send(
    {
      from: RESEND_FROM,
      html,
      subject: input.title,
      to: input.to,
    },
    { idempotencyKey: input.idempotencyKey }
  );

  if (error || !data) {
    return {
      error: error?.message ?? "Resend did not return an email ID",
      ok: false,
    };
  }

  return { ok: true, value: { id: data.id } };
}

export interface SendEarlyAccessApplicationInput {
  readonly application: {
    readonly calendarClient: string;
    readonly companySize: string;
    readonly country: string;
    readonly currentProcess: string;
    readonly email: string;
    readonly heardFrom: string;
    readonly reference: string;
    readonly usesXeroPayroll: string;
  };
  readonly idempotencyKey: string;
  readonly to: string;
}

export async function sendEarlyAccessApplication(
  input: SendEarlyAccessApplicationInput
): Promise<SendNotificationEmailResult> {
  const { RESEND_FROM } = keys();
  if (!(resend && RESEND_FROM)) {
    return { error: "Resend transport is not configured", ok: false };
  }
  const template: {
    EarlyAccessApplicationEmail: (
      props: SendEarlyAccessApplicationInput["application"]
    ) => ReactElement;
  } = require("./templates/early-access-application");
  const html = await render(
    template.EarlyAccessApplicationEmail(input.application)
  );
  const { data, error } = await resend.emails.send(
    {
      from: RESEND_FROM,
      html,
      replyTo: input.application.email,
      subject: `AU early access application ${input.application.reference}`,
      to: input.to,
    },
    { idempotencyKey: input.idempotencyKey }
  );
  if (error || !data) {
    return {
      error: error?.message ?? "Resend did not return an email ID",
      ok: false,
    };
  }
  return { ok: true, value: { id: data.id } };
}

export { type ContactMessage, sendContactEmail } from "./contact";
