import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { authCopy } from "@/components/auth/auth-copy";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = createMetadata(authCopy.forgotPassword);

const Page = () => <ForgotPasswordForm />;

export default Page;
