"use client";

import { useState } from "react";

interface ApplicationResponse {
  error?: string;
  reference?: string;
}

export const EarlyAccessApplicationForm = () => {
  const [status, setStatus] = useState<{
    kind: "idle" | "sending" | "success" | "error";
    message?: string;
  }>({ kind: "idle" });

  return (
    <form
      aria-describedby="application-privacy"
      aria-label="Early access application"
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const applicationForm = event.currentTarget;
        setStatus({ kind: "sending" });
        const form = new FormData(applicationForm);
        const payload = Object.fromEntries(form.entries());
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/early-access`,
            {
              body: JSON.stringify(payload),
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
              },
              method: "POST",
            }
          );
          const result = (await response.json()) as ApplicationResponse;
          if (!(response.ok && result.reference)) {
            throw new Error(result.error ?? "Application failed");
          }
          setStatus({
            kind: "success",
            message: `Application received. Your reference is ${result.reference}.`,
          });
          applicationForm.reset();
        } catch (error) {
          setStatus({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "We could not submit your application. Please try again.",
          });
        }
      }}
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
        <label htmlFor="xero-payroll">Do you use Xero Payroll Australia?</label>
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
          id="current-process"
          maxLength={1000}
          minLength={10}
          name="currentProcess"
          required
          rows={5}
        />
        <p>
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
        application. Rejected or inactive application correspondence is removed
        after 90 days. Admission staff can access the private mailbox and
        respond Monday–Friday, 9 am–5 pm AEST, usually within two business days.
      </p>
      <button
        className="marketing-btn marketing-btn--primary"
        disabled={status.kind === "sending"}
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
  );
};
