"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthFrame, AuthLink } from "./auth-form-elements";

export function AcceptInvitationForm({
  email,
  invitationId,
}: {
  email: string | null;
  invitationId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const accept = async () => {
    setPending(true);
    setProblem(null);
    try {
      const response = await fetch(
        `/api/auth/account-invitations/${encodeURIComponent(invitationId)}/accept`,
        { credentials: "same-origin", method: "POST" }
      );
      if (!response.ok) {
        setProblem(
          response.status === 401
            ? "Sign in again to accept this invitation."
            : "This invitation could not be accepted. Check that you signed in with the invited email, or ask for a new invitation."
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setProblem(
        "The invitation could not be accepted. Check your connection and try again."
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthFrame
      description={
        email
          ? `You are signed in as ${email}.`
          : "Accept your invitation to start using Team Calendar."
      }
      title="Join this Account"
    >
      {Boolean(problem) && (
        <p
          className="rounded-xl bg-error-container p-3 text-body-sm text-on-error-container"
          role="alert"
        >
          {problem}
        </p>
      )}
      <Button
        aria-busy={pending}
        className="h-11 w-full"
        disabled={pending}
        onClick={accept}
        type="button"
      >
        {pending ? "Joining Account…" : "Accept invitation"}
      </Button>
      <p className="text-center text-body-sm">
        <AuthLink
          href={`/sign-in?${new URLSearchParams({ invitationId, returnTo: `/accept-invitation/${invitationId}` })}`}
        >
          Use a different email
        </AuthLink>
      </p>
      <p className="text-center text-body-sm">
        <AuthLink href="/select-account">Choose another Account</AuthLink>
      </p>
    </AuthFrame>
  );
}
