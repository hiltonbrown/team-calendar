"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { useRef, useState } from "react";

interface ApplicationResponse {
  error?: string;
  reference?: string;
}

export const EarlyAccessApplicationForm = () => {
  const [status, setStatus] = useState<{
    kind: "idle" | "sending" | "success" | "error";
    message?: string;
  }>({ kind: "idle" });

  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef<boolean>(false);
  const request = useRef<{ body: string; key: string } | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [email, setEmail] = useState("");

  const submitApplication = async () => {
    const applicationForm = formRef.current;
    if (!applicationForm || inFlight.current) {
      return;
    }
    inFlight.current = true;
    setStatus({ kind: "sending" });
    const body = JSON.stringify(
      Object.fromEntries(new FormData(applicationForm).entries())
    );
    if (request.current?.body !== body) {
      request.current = { body, key: crypto.randomUUID() };
    }
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/early-access`,
        {
          body,
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": request.current.key,
          },
          method: "POST",
        }
      );
      // The endpoint returns only a public error or application reference.
      const result = (await response.json()) as ApplicationResponse;
      if (!(response.ok && result.reference)) {
        setStatus({
          kind: "error",
          message:
            result.error ??
            "We could not submit your application. Please try again.",
        });
        return;
      }
      setStatus({
        kind: "success",
        message: `Application received. Your reference is ${result.reference}.`,
      });
      applicationForm.reset();
      request.current = null;
    } catch {
      setStatus({
        kind: "error",
        message: "We could not submit your application. Please try again.",
      });
    } finally {
      inFlight.current = false;
      setConfirmation(false);
    }
  };

  return (
    <>
      <form
        aria-busy={status.kind === "sending"}
        aria-describedby="application-privacy"
        aria-label="Early access application"
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (inFlight.current || !event.currentTarget.reportValidity()) {
            return;
          }
          const form = new FormData(event.currentTarget);
          if (form.get("usesXeroPayroll") !== "yes") {
            setStatus({
              kind: "error",
              message:
                "Early access is currently available only to organisations using Xero Payroll Australia.",
            });
            return;
          }
          setEmail(String(form.get("email")));
          setStatus({ kind: "idle" });
          setConfirmation(true);
        }}
        ref={formRef}
      >
        <div>
          <label htmlFor="application-email">Work email</label>
          <input
            autoComplete="email"
            id="application-email"
            maxLength={254}
            name="email"
            required
            type="email"
          />
        </div>
        <div>
          <label htmlFor="company-size">Company size</label>
          <select id="company-size" name="companySize" required>
            <option value="">Select</option>
            <option value="1-7">1–7 people</option>
            <option value="8-30">8–30 people</option>
            <option value="31-75">31–75 people</option>
            <option value="76+">76+ people</option>
          </select>
        </div>
        <div>
          <label htmlFor="country">Country</label>
          <select id="country" name="country" required>
            <option value="AU">Australia</option>
          </select>
        </div>
        <div>
          <label htmlFor="xero-payroll">
            Do you use Xero Payroll Australia?
          </label>
          <select id="xero-payroll" name="usesXeroPayroll" required>
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label htmlFor="calendar-client">Primary calendar</label>
          <select id="calendar-client" name="calendarClient" required>
            <option value="">Select</option>
            <option value="microsoft">Microsoft Outlook</option>
            <option value="google">Google Calendar</option>
            <option value="apple">Apple Calendar</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label htmlFor="current-process">
            How do you manage leave and availability today?
          </label>
          <textarea
            aria-describedby="application-process-help"
            id="current-process"
            maxLength={1000}
            minLength={10}
            name="currentProcess"
            required
            rows={5}
          />
          <p id="application-process-help">
            Do not include or attach payroll records, leave records, or employee
            personal information.
          </p>
        </div>
        <div>
          <label htmlFor="heard-from">
            How did you hear about Team Calendar?
          </label>
          <input
            id="heard-from"
            maxLength={200}
            minLength={2}
            name="heardFrom"
            required
          />
        </div>
        <p id="application-privacy">
          We use these details only to assess and respond to your early access
          application. Rejected or inactive application correspondence is
          removed after 90 days. Admission staff can access the private mailbox
          and respond Monday–Friday, 9 am–5 pm AEST, usually within two business
          days.
        </p>
        <button
          className="marketing-btn marketing-btn--primary"
          disabled={status.kind === "sending"}
          ref={submitRef}
          type="submit"
        >
          {status.kind === "sending" ? "Submitting…" : "Apply for early access"}
        </button>
        {status.kind !== "idle" && status.kind !== "sending" ? (
          <p
            aria-live="polite"
            role={status.kind === "error" ? "alert" : "status"}
          >
            {status.message}
          </p>
        ) : null}
      </form>
      <AlertDialog
        onOpenChange={(open) => {
          if (!inFlight.current) {
            setConfirmation(open);
          }
        }}
        open={confirmation}
      >
        <AlertDialogContent
          className="marketing-application-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            submitRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Submit your application?</AlertDialogTitle>
            <AlertDialogDescription>
              We’ll review your details and respond to{" "}
              <strong className="break-all">{email}</strong>, usually within two
              business days. Applying does not grant immediate access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={status.kind === "sending"}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={status.kind === "sending"}
              onClick={async (event) => {
                event.preventDefault();
                await submitApplication();
              }}
            >
              {status.kind === "sending" ? "Submitting…" : "Submit application"}
            </AlertDialogAction>
          </AlertDialogFooter>
          {status.kind === "sending" ? (
            <p role="status">Submitting your application…</p>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
