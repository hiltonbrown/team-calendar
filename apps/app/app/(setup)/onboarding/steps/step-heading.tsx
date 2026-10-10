"use client";

import { type ReactNode, useEffect, useRef } from "react";

// Moves focus to the step heading whenever the step changes, so keyboard and
// screen reader users start at the new step rather than the old button.
export function StepHeading({
  children,
  description,
  stepId,
}: {
  children: ReactNode;
  description?: ReactNode;
  stepId: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (stepId) {
      ref.current?.focus();
    }
  }, [stepId]);
  return (
    <div className="space-y-2">
      <h1
        className="text-balance font-semibold text-foreground text-headline-md tracking-tight outline-hidden"
        ref={ref}
        tabIndex={-1}
      >
        {children}
      </h1>
      {description ? (
        <p className="text-body-md text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function ActionError({ message }: { message: string | null }) {
  return message ? (
    <p
      className="rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container"
      role="alert"
    >
      {message}
    </p>
  ) : null;
}
