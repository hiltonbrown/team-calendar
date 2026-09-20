import { signUpCopy } from "@repo/auth/components/sign-up";
import { isEarlyAccess } from "@repo/next-config/launch-mode";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

const SignUp = dynamic(() =>
  import("@repo/auth/components/sign-up").then((mod) => mod.SignUp)
);

export const metadata: Metadata = createMetadata({
  description: signUpCopy.description,
  title: signUpCopy.title,
});

const SignUpPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ __clerk_ticket?: string }>;
}) => {
  const { __clerk_ticket: invitationTicket } = await searchParams;
  const isDevelopment = process.env.NODE_ENV === "development";
  const hasInvitationTicket = Boolean(invitationTicket?.trim());

  if (!isDevelopment && isEarlyAccess() && !hasInvitationTicket) {
    const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3001";
    redirect(new URL("/contact?admission=required", webUrl).toString());
  }

  return <SignUp />;
};

export default SignUpPage;
