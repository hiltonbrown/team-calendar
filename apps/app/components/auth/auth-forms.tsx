"use client";

import {
  requestPasswordReset,
  resetPassword,
  safeAuthReturnTo,
  sendVerificationEmail,
  signInEmail,
  signInMagicLink,
  signInSocial,
  signUpEmail,
} from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { authCopy } from "./auth-copy";
import {
  AuthField,
  AuthFrame,
  AuthLink,
  AuthStatus,
  FormProblem,
  SubmitButton,
} from "./auth-form-elements";
import { useAuthForm } from "./auth-form-state";

const email = z.string().trim().email("Enter a valid email address.");
const password = z
  .string()
  .min(12, "Use at least 12 characters for your password.")
  .max(128, "Use no more than 128 characters for your password.");
const signInSchema = z.object({
  email,
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(128, "Use no more than 128 characters for your password."),
});
const signUpSchema = z.object({
  email,
  name: z
    .string()
    .trim()
    .min(1, "Enter your full name.")
    .max(200, "Use no more than 200 characters for your name."),
  password,
});
const emailSchema = z.object({ email });
const resetSchema = z
  .object({ confirmPassword: z.string(), newPassword: password })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"],
  });
const providers = [{ id: "xero-auth", label: "Xero" }] as const;

interface Destination {
  invitationId?: string;
  returnTo?: string;
}
const accountDestination = (value: string | undefined) =>
  `/select-account?${new URLSearchParams({ returnTo: safeAuthReturnTo(value) })}`;
const verifiedDestination = (value: string | undefined) =>
  `/sign-in?${new URLSearchParams({ returnTo: safeAuthReturnTo(value), verified: "1" })}`;
function authLink(path: string, { invitationId, returnTo }: Destination) {
  const query = new URLSearchParams();
  const destination = safeAuthReturnTo(returnTo);
  if (destination !== "/") {
    query.set("returnTo", destination);
  }
  if (invitationId) {
    query.set("invitationId", invitationId);
  }
  return query.size ? `${path}?${query}` : path;
}

function SocialButtons({
  destination,
  form,
}: {
  destination: Destination;
  form: ReturnType<typeof useAuthForm>;
}) {
  return (
    <fieldset className="space-y-3" disabled={form.pending}>
      <legend className="mb-3 w-full text-center text-body-sm text-muted-foreground">
        Or continue with
      </legend>
      {providers.map(({ id, label }) => (
        <Button
          aria-busy={form.pendingAction === id}
          className="h-11 w-full"
          disabled={form.pending}
          key={id}
          onClick={() =>
            form.run(
              () =>
                signInSocial({
                  callbackURL: accountDestination(destination.returnTo),
                  errorCallbackURL: authLink("/sign-in", destination),
                  provider: id,
                  ...(destination.invitationId
                    ? { invitationId: destination.invitationId }
                    : {}),
                }),
              undefined,
              id
            )
          }
          type="button"
          variant="outline"
        >
          {form.pendingAction === id && (
            <LoaderCircleIcon
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          )}
          Continue with {label}
        </Button>
      ))}
    </fieldset>
  );
}

export function SignInForm({
  error,
  invitationId,
  returnTo,
  verified = false,
}: Destination & { error?: string; verified?: boolean }) {
  const router = useRouter();
  const form = useAuthForm("sign-in");
  const destination = { invitationId, returnTo };
  const callbackURL = accountDestination(returnTo);
  return (
    <AuthFrame {...authCopy.signIn}>
      {Boolean(verified) && (
        <AuthStatus>
          Your email has been verified. Sign in to continue.
        </AuthStatus>
      )}
      {Boolean(error) && (
        <p className="text-body-sm text-destructive" role="alert">
          We couldn't finish signing in. Try again, or choose another sign-in
          method.
        </p>
      )}
      <form
        aria-label="Sign in with email"
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit(
          signInSchema,
          (values) => signInEmail({ ...values, callbackURL }),
          () => {
            router.replace(callbackURL);
            router.refresh();
          }
        )}
      >
        <FormProblem fields={form.fieldErrors} message={form.problem} />
        <AuthField
          autoComplete="email"
          disabled={form.pending}
          errors={form.fieldErrors}
          id="sign-in-email"
          label="Email address"
          maxLength={254}
          name="email"
          type="email"
        />
        <AuthField
          autoComplete="current-password"
          disabled={form.pending}
          errors={form.fieldErrors}
          id="sign-in-password"
          label="Password"
          maxLength={128}
          name="password"
          type="password"
        />
        <div className="text-right text-body-sm">
          <AuthLink href={authLink("/forgot-password", destination)}>
            Forgot your password?
          </AuthLink>
        </div>
        <SubmitButton
          disabled={form.pending}
          pending={form.pendingAction === "email"}
        >
          Sign in
        </SubmitButton>
      </form>
      <SocialButtons destination={destination} form={form} />
      <div className="space-y-3 text-center text-body-sm text-muted-foreground">
        <p>
          <AuthLink href={authLink("/magic-link", destination)}>
            Email me a sign-in link
          </AuthLink>
        </p>
        <p>
          New to Team Calendar?{" "}
          <AuthLink href={authLink("/sign-up", destination)}>
            Create your Account
          </AuthLink>
        </p>
        <p>
          <AuthLink href={authLink("/verify-email", destination)}>
            Resend verification email
          </AuthLink>
        </p>
      </div>
    </AuthFrame>
  );
}

export function SignUpForm({ invitationId, returnTo }: Destination) {
  const router = useRouter();
  const form = useAuthForm("sign-up");
  const destination = { invitationId, returnTo };
  return (
    <AuthFrame {...authCopy.signUp}>
      {Boolean(invitationId) && (
        <p className="text-body-sm text-muted-foreground">
          Use the email address on your invitation to join your team.
        </p>
      )}
      <form
        aria-label="Create your Account"
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit(
          signUpSchema,
          (values) =>
            signUpEmail({
              ...values,
              callbackURL: verifiedDestination(returnTo),
              ...(invitationId ? { invitationId } : {}),
            }),
          () =>
            router.replace(
              authLink("/verify-email", { returnTo }) +
                (returnTo && safeAuthReturnTo(returnTo) !== "/"
                  ? "&sent=1"
                  : "?sent=1")
            )
        )}
      >
        <FormProblem fields={form.fieldErrors} message={form.problem} />
        <AuthField
          autoComplete="name"
          disabled={form.pending}
          errors={form.fieldErrors}
          id="sign-up-name"
          label="Full name"
          maxLength={200}
          name="name"
        />
        <AuthField
          autoComplete="email"
          disabled={form.pending}
          errors={form.fieldErrors}
          id="sign-up-email"
          label="Email address"
          maxLength={254}
          name="email"
          type="email"
        />
        <AuthField
          autoComplete="new-password"
          disabled={form.pending}
          errors={form.fieldErrors}
          help="Use 12 to 128 characters. Spaces are welcome."
          id="sign-up-password"
          label="Password"
          maxLength={128}
          name="password"
          type="password"
        />
        <SubmitButton
          disabled={form.pending}
          pending={form.pendingAction === "email"}
        >
          Create your Account
        </SubmitButton>
      </form>
      <SocialButtons destination={destination} form={form} />
      <p className="text-center text-body-sm text-muted-foreground">
        Already have a sign-in?{" "}
        <AuthLink href={authLink("/sign-in", destination)}>Sign in</AuthLink>
      </p>
    </AuthFrame>
  );
}

export function VerifyEmailForm({
  error,
  returnTo,
  sent = false,
}: {
  error?: string;
  returnTo?: string;
  sent?: boolean;
}) {
  const form = useAuthForm("verify-email");
  const [delivered, setDelivered] = useState(sent);
  return (
    <AuthFrame {...authCopy.verifyEmail}>
      {Boolean(error) && (
        <p className="text-body-sm text-destructive" role="alert">
          This verification link is invalid or has expired. Request a new email
          below.
        </p>
      )}
      {Boolean(delivered) && (
        <AuthStatus>
          <p>Check your email for a verification link.</p>
          <p>If you have already verified your email, sign in to continue.</p>
        </AuthStatus>
      )}
      <form
        aria-label="Resend verification email"
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit(
          emailSchema,
          (values) =>
            sendVerificationEmail({
              ...values,
              callbackURL: verifiedDestination(returnTo),
            }),
          () => setDelivered(true)
        )}
      >
        <FormProblem fields={form.fieldErrors} message={form.problem} />
        <AuthField
          autoComplete="email"
          disabled={form.pending}
          errors={form.fieldErrors}
          id="verify-email-email"
          label="Email address"
          maxLength={254}
          name="email"
          type="email"
        />
        <SubmitButton disabled={form.pending} pending={form.pending}>
          Resend verification email
        </SubmitButton>
      </form>
      <p className="text-center text-body-sm">
        <AuthLink href={authLink("/sign-in", { returnTo })}>
          Back to sign in
        </AuthLink>
      </p>
    </AuthFrame>
  );
}

export function ForgotPasswordForm() {
  const form = useAuthForm("forgot-password");
  const [sent, setSent] = useState(false);
  return (
    <AuthFrame {...authCopy.forgotPassword}>
      <FormProblem fields={form.fieldErrors} message={form.problem} />
      {sent ? (
        <AuthStatus>
          <p>
            If a password can be reset for this address, a link will arrive
            shortly.
          </p>
          <p>
            It expires in one hour. Check your junk folder if it doesn't arrive.
          </p>
        </AuthStatus>
      ) : (
        <form
          aria-label="Request a password reset"
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit(
            emailSchema,
            (values) =>
              requestPasswordReset({
                ...values,
                redirectTo: "/reset-password",
              }),
            () => setSent(true)
          )}
        >
          <AuthField
            autoComplete="email"
            disabled={form.pending}
            errors={form.fieldErrors}
            id="forgot-password-email"
            label="Email address"
            maxLength={254}
            name="email"
            type="email"
          />
          <SubmitButton disabled={form.pending} pending={form.pending}>
            Send reset link
          </SubmitButton>
        </form>
      )}
      {Boolean(sent) && (
        <Button
          className="h-11 w-full"
          onClick={() => setSent(false)}
          type="button"
          variant="outline"
        >
          Send another link
        </Button>
      )}
      <p className="text-center text-body-sm">
        <AuthLink href="/sign-in">Back to sign in</AuthLink>
      </p>
    </AuthFrame>
  );
}

export function ResetPasswordForm({
  complete = false,
  error,
  token,
}: {
  complete?: boolean;
  error?: string;
  token?: string;
}) {
  const form = useAuthForm("reset-password");
  const router = useRouter();
  const [done, setDone] = useState(complete);
  const resetToken =
    typeof token === "string" &&
    token.length > 0 &&
    token.length <= 2048 &&
    !error
      ? token
      : null;
  if (done) {
    return (
      <AuthFrame {...authCopy.resetPassword}>
        <AuthStatus>
          Your password has been reset. Sign in with your new password.
        </AuthStatus>
        <p className="text-center text-body-sm">
          <AuthLink href="/sign-in">Sign in</AuthLink>
        </p>
      </AuthFrame>
    );
  }
  if (!resetToken) {
    return (
      <AuthFrame {...authCopy.resetPassword}>
        <p
          className="rounded-xl bg-error-container p-3 text-body-md text-on-error-container"
          role="alert"
        >
          Request a new password reset link. This link is missing, invalid or
          has expired.
        </p>
        <p className="text-center text-body-sm">
          <AuthLink href="/forgot-password">Request a new link</AuthLink>
        </p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame {...authCopy.resetPassword}>
      <form
        aria-label="Reset your password"
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit(
          resetSchema,
          ({ newPassword }) =>
            resetPassword({ newPassword, token: resetToken }),
          () => {
            setDone(true);
            router.replace("/reset-password?complete=1");
          }
        )}
      >
        <FormProblem fields={form.fieldErrors} message={form.problem} />
        <AuthField
          autoComplete="new-password"
          disabled={form.pending}
          errors={form.fieldErrors}
          help="Use 12 to 128 characters. Spaces are welcome."
          id="reset-password-newPassword"
          label="New password"
          maxLength={128}
          name="newPassword"
          type="password"
        />
        <AuthField
          autoComplete="new-password"
          disabled={form.pending}
          errors={form.fieldErrors}
          id="reset-password-confirmPassword"
          label="Confirm new password"
          maxLength={128}
          name="confirmPassword"
          type="password"
        />
        <SubmitButton disabled={form.pending} pending={form.pending}>
          Reset password
        </SubmitButton>
      </form>
    </AuthFrame>
  );
}

export function MagicLinkForm({ invitationId, returnTo }: Destination) {
  const form = useAuthForm("magic-link");
  const [sent, setSent] = useState(false);
  return (
    <AuthFrame {...authCopy.magicLink}>
      <FormProblem fields={form.fieldErrors} message={form.problem} />
      {sent ? (
        <AuthStatus>
          <p>Check your email for a sign-in link.</p>
          <p>
            Your link expires in five minutes and can be used once. Check your
            junk folder if it doesn't arrive.
          </p>
        </AuthStatus>
      ) : (
        <form
          aria-label="Email a sign-in link"
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit(
            emailSchema,
            (values) =>
              signInMagicLink({
                ...values,
                callbackURL: accountDestination(returnTo),
                ...(invitationId ? { invitationId } : {}),
              }),
            () => setSent(true)
          )}
        >
          <AuthField
            autoComplete="email"
            disabled={form.pending}
            errors={form.fieldErrors}
            id="magic-link-email"
            label="Email address"
            maxLength={254}
            name="email"
            type="email"
          />
          <SubmitButton disabled={form.pending} pending={form.pending}>
            Send sign-in link
          </SubmitButton>
        </form>
      )}
      {Boolean(sent) && (
        <Button
          className="h-11 w-full"
          onClick={() => setSent(false)}
          type="button"
          variant="outline"
        >
          Send another link
        </Button>
      )}
      <p className="text-center text-body-sm">
        <AuthLink href={authLink("/sign-in", { invitationId, returnTo })}>
          Sign in with a password
        </AuthLink>
      </p>
    </AuthFrame>
  );
}
