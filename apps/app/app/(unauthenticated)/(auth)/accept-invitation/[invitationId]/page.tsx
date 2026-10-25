import { getCurrentUser } from "@repo/auth/server";
import { createMetadata } from "@repo/seo/metadata";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AcceptInvitationForm } from "@/components/auth/accept-invitation-form";

export const metadata = createMetadata({
  description: "Accept your Team Calendar Account invitation.",
  title: "Join an Account",
});

const AcceptInvitationPage = async ({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) => {
  const parsed = z.uuid().safeParse((await params).invitationId);
  if (!parsed.success) {
    notFound();
  }
  const returnTo = `/accept-invitation/${parsed.data}`;
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/sign-in?${new URLSearchParams({ invitationId: parsed.data, returnTo })}`
    );
  }
  if (!user.emailVerified) {
    redirect(`/verify-email?${new URLSearchParams({ returnTo })}`);
  }
  return <AcceptInvitationForm email={user.email} invitationId={parsed.data} />;
};

export default AcceptInvitationPage;
