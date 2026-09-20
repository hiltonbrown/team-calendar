import { signUpCopy } from "@repo/auth/components/sign-up";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";

const SignUp = dynamic(() =>
  import("@repo/auth/components/sign-up").then((mod) => mod.SignUp)
);

export const metadata: Metadata = createMetadata({
  description: signUpCopy.description,
  title: signUpCopy.title,
});

const SignUpPage = () => <SignUp />;

export default SignUpPage;
