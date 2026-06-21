import { SignUp as ClerkSignUp } from "@clerk/nextjs";
import { AuthFormFrame } from "./auth-form-frame";
import { embeddedAuthAppearance } from "./embedded-auth-appearance";

export const signUpCopy = {
  title: "Create your organisation",
  description:
    "Start a new LeaveSync organisation, or accept an invitation from your team email.",
};

export const SignUp = () => (
  <AuthFormFrame {...signUpCopy}>
    <ClerkSignUp appearance={embeddedAuthAppearance} />
  </AuthFormFrame>
);
