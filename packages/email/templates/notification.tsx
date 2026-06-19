import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import type { ReactElement } from "react";

interface NotificationEmailTemplateProps {
  readonly actionUrl: string | null;
  readonly body: string;
  readonly title: string;
  readonly unsubscribeUrl: string;
}

type NotificationEmailTemplateComponent = ((
  props: NotificationEmailTemplateProps
) => ReactElement) & {
  PreviewProps?: NotificationEmailTemplateProps;
};

export const NotificationEmailTemplate: NotificationEmailTemplateComponent = ({
  actionUrl,
  body,
  title,
  unsubscribeUrl,
}: NotificationEmailTemplateProps) => (
  <Tailwind>
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body className="bg-zinc-50 font-sans">
        <Container className="mx-auto py-12">
          <Section className="mt-8 rounded-md bg-zinc-200 p-px">
            <Section className="rounded-[5px] bg-white p-8">
              <Text className="mt-0 mb-4 font-semibold text-2xl text-zinc-950">
                {title}
              </Text>
              <Text className="m-0 text-zinc-600">{body}</Text>
              {actionUrl && (
                <Button
                  className="mt-6 rounded-md bg-[#336A3B] px-4 py-3 font-medium text-white"
                  href={actionUrl}
                >
                  Open in LeaveSync
                </Button>
              )}
              <Hr className="my-6" />
              <Text className="m-0 text-xs text-zinc-500">
                To change email notifications, open your{" "}
                <a className="text-[#336A3B]" href={unsubscribeUrl}>
                  notification preferences
                </a>
                .
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
);

NotificationEmailTemplate.PreviewProps = {
  actionUrl: "https://app.leavesync.test/notifications",
  body: "A leave request needs your attention.",
  title: "Leave submitted for approval",
  unsubscribeUrl:
    "https://app.leavesync.test/notifications?tab=preferences&focus=leave_submitted",
};

// React Email's CLI discovers templates via the default export, so keep one
// alongside the named export used by application code.
export default NotificationEmailTemplate;
