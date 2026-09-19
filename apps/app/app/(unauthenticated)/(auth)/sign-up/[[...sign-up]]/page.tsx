import { signUpCopy } from "@repo/auth/components/sign-up";
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
  if (!invitationTicket) {
    const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3001";
    redirect(`${webUrl}/contact?admission=required`);
  }
  return <SignUp />;
};

export default SignUpPage;
