import { sendAuthEmail } from "@repo/email";
import { deliverInvitationEmail } from "./native-mutation-context";

export function sendAccountInvitationEmail(
  input: { accountName: string; email: string; id: string },
  origin: string
): Promise<void> {
  return deliverInvitationEmail(() =>
    sendAuthEmail({
      actionLabel: "View invitation",
      actionUrl: new URL(
        `/accept-invitation/${encodeURIComponent(input.id)}`,
        origin
      ).href,
      body: `You have been invited to join ${input.accountName}.`,
      subject: `Invitation to ${input.accountName} on Team Calendar`,
      to: input.email,
    })
  );
}
