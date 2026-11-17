"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { EyeIcon, EyeOffIcon, LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AuthFieldErrors } from "./auth-form-state";

export function AuthFrame({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section aria-label={title} className="space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-balance font-semibold text-foreground text-headline-md">
          {title}
        </h1>
        <p className="text-body-md text-muted-foreground">{description}</p>
      </header>
      {children}
    </section>
  );
}

export function FormProblem({
  fields,
  message,
}: {
  fields: AuthFieldErrors;
  message: string | null;
}) {
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message || Object.keys(fields).length > 0) {
      summary.current?.focus();
    }
  }, [fields, message]);
  if (!message) {
    return null;
  }
  return (
    <div
      className="space-y-2 rounded-xl bg-error-container p-3 text-body-sm text-on-error-container outline-hidden focus-visible:outline-3 focus-visible:outline-destructive focus-visible:outline-offset-2"
      ref={summary}
      role="alert"
      tabIndex={-1}
    >
      <p>{message}</p>
      {Object.keys(fields).length > 0 && (
        <ul className="list-inside list-disc space-y-1">
          {Object.entries(fields).map(([id, value]) => (
            <li key={id}>
              <a
                className="underline underline-offset-4 hover:decoration-2"
                href={`#${id}`}
              >
                {value}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AuthField({
  autoComplete,
  disabled,
  errors,
  help,
  id,
  label,
  maxLength,
  name,
  type = "text",
}: {
  autoComplete: ComponentProps<"input">["autoComplete"];
  disabled: boolean;
  errors: AuthFieldErrors;
  help?: string;
  id: string;
  label: string;
  maxLength?: number;
  name: string;
  type?: "email" | "password" | "text";
}) {
  const [visible, setVisible] = useState(false);
  const error = errors[id];
  const describedBy =
    [help ? `${id}-help` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          autoComplete={autoComplete}
          className={type === "password" ? "h-11 pr-12" : "h-11"}
          disabled={disabled}
          id={id}
          maxLength={maxLength}
          name={name}
          required
          spellCheck={type === "email" ? false : undefined}
          type={type === "password" && visible ? "text" : type}
        />
        {type === "password" && (
          <Button
            aria-controls={id}
            aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-pressed={visible}
            className="absolute top-0 right-0 h-11 w-11"
            disabled={disabled}
            onClick={() => setVisible((value) => !value)}
            size="icon"
            type="button"
            variant="ghost"
          >
            {visible ? (
              <EyeOffIcon aria-hidden="true" />
            ) : (
              <EyeIcon aria-hidden="true" />
            )}
          </Button>
        )}
      </div>
      {Boolean(help) && (
        <p className="text-body-sm text-muted-foreground" id={`${id}-help`}>
          {help}
        </p>
      )}
      {Boolean(error) && (
        <p className="text-body-sm text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({
  children,
  disabled,
  pending,
}: {
  children: ReactNode;
  disabled: boolean;
  pending: boolean;
}) {
  return (
    <Button
      aria-busy={pending}
      className="h-11 w-full"
      disabled={disabled}
      type="submit"
    >
      {Boolean(pending) && (
        <LoaderCircleIcon
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
        />
      )}
      {children}
    </Button>
  );
}

export function AuthStatus({ children }: { children: ReactNode }) {
  return (
    <div
      className="space-y-2 rounded-2xl bg-surface-container p-4 text-body-md text-foreground"
      role="status"
    >
      {children}
    </div>
  );
}

export function AuthLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      className="text-primary underline underline-offset-4 outline-hidden hover:decoration-2 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
      href={href}
    >
      {children}
    </Link>
  );
}
