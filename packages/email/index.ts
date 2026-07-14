import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { Resend } from "resend";
import { keys } from "./keys";

const { RESEND_TOKEN } = keys();

export const resend = RESEND_TOKEN ? new Resend(RESEND_TOKEN) : undefined;

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
    return { ok: false, error: "Resend transport is not configured" };
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
      ok: false,
      error: error?.message ?? "Resend did not return an email ID",
    };
  }

  return { ok: true, value: { id: data.id } };
}
