"use client";

import { type FormEvent, useRef, useState } from "react";
import { z } from "zod";

const publicError = z.object({ code: z.string().optional() });
const requestFailure = "We couldn't complete that request. Please try again.";
const messages: Record<string, string> = {
  EMAIL_NOT_VERIFIED:
    "Verify your email address before signing in. You can request another verification email below.",
  INVALID_EMAIL_OR_PASSWORD:
    "Check your email address and password, then try again.",
  INVALID_TOKEN:
    "This link has expired or has already been used. Request a new link and try again.",
  TOO_MANY_REQUESTS: "Too many attempts. Wait a minute, then try again.",
  USER_ALREADY_EXISTS:
    "We couldn't create your sign-in. Try signing in or resetting your password.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "We couldn't create your sign-in. Try signing in or resetting your password.",
};

interface RequestResult {
  error?: unknown;
}
export type AuthFieldErrors = Record<string, string>;

export function useAuthForm(scope: string) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const inFlight = useRef<boolean>(false);

  async function run(
    request: () => Promise<RequestResult>,
    onSuccess?: () => void,
    action = "email"
  ) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPendingAction(action);
    setProblem(null);
    setFieldErrors({});
    try {
      const result = await request();
      if (result.error) {
        const parsed = publicError.safeParse(result.error);
        setProblem(
          parsed.success && parsed.data.code
            ? (messages[parsed.data.code] ?? requestFailure)
            : requestFailure
        );
      } else {
        onSuccess?.();
      }
    } catch {
      setProblem(requestFailure);
    } finally {
      inFlight.current = false;
      setPendingAction(null);
    }
  }

  function handleSubmit<Schema extends z.ZodType>(
    schema: Schema,
    request: (values: z.output<Schema>) => Promise<RequestResult>,
    onSuccess?: () => void
  ) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (inFlight.current) {
        return;
      }
      const parsed = schema.safeParse(
        Object.fromEntries(new FormData(event.currentTarget))
      );
      if (!parsed.success) {
        setFieldErrors(
          Object.fromEntries(
            parsed.error.issues.map((issue) => [
              `${scope}-${String(issue.path[0])}`,
              issue.message,
            ])
          )
        );
        setProblem("Check the highlighted fields.");
        return;
      }
      return run(() => request(parsed.data), onSuccess);
    };
  }

  return {
    fieldErrors,
    handleSubmit,
    pending: pendingAction !== null,
    pendingAction,
    problem,
    run,
  };
}
