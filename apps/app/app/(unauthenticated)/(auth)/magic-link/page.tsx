import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { authCopy } from "@/components/auth/auth-copy";
import { MagicLinkForm } from "@/components/auth/auth-forms";
import {
  type AuthPageProperties,
  authSearchParam,
} from "@/components/auth/auth-page-params";

export const metadata: Metadata = createMetadata(authCopy.magicLink);

const Page = async ({ searchParams }: AuthPageProperties) => {
  const query = await searchParams;
  return (
    <MagicLinkForm
      invitationId={authSearchParam(query, "invitationId")}
      returnTo={authSearchParam(query, "returnTo")}
    />
  );
};

export default Page;
