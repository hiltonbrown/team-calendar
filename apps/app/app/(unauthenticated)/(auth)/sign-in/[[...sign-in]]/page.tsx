import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { authCopy } from "@/components/auth/auth-copy";
import { SignInForm } from "@/components/auth/auth-forms";
import {
  type AuthPageProperties,
  authSearchParam,
} from "@/components/auth/auth-page-params";

export const metadata: Metadata = createMetadata(authCopy.signIn);

const Page = async ({ searchParams }: AuthPageProperties) => {
  const query = await searchParams;
  return (
    <SignInForm
      error={authSearchParam(query, "error")}
      invitationId={authSearchParam(query, "invitationId")}
      returnTo={authSearchParam(query, "returnTo")}
      verified={authSearchParam(query, "verified") === "1"}
    />
  );
};

export default Page;
