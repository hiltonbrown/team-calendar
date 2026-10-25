import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { authCopy } from "@/components/auth/auth-copy";
import { VerifyEmailForm } from "@/components/auth/auth-forms";
import {
  type AuthPageProperties,
  authSearchParam,
} from "@/components/auth/auth-page-params";

export const metadata: Metadata = createMetadata(authCopy.verifyEmail);

const Page = async ({ searchParams }: AuthPageProperties) => {
  const query = await searchParams;
  return (
    <VerifyEmailForm
      error={authSearchParam(query, "error")}
      returnTo={authSearchParam(query, "returnTo")}
      sent={authSearchParam(query, "sent") === "1"}
    />
  );
};

export default Page;
