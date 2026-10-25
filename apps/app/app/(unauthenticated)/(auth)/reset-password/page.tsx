import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { authCopy } from "@/components/auth/auth-copy";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import {
  type AuthPageProperties,
  authSearchParam,
} from "@/components/auth/auth-page-params";

export const metadata: Metadata = createMetadata(authCopy.resetPassword);

const Page = async ({ searchParams }: AuthPageProperties) => {
  const query = await searchParams;
  return (
    <ResetPasswordForm
      complete={authSearchParam(query, "complete") === "1"}
      error={authSearchParam(query, "error")}
      token={authSearchParam(query, "token")}
    />
  );
};

export default Page;
