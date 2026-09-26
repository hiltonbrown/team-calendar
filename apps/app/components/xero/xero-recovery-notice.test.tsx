import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { XeroRecoveryNotice } from "./xero-recovery-notice";

const FORBIDDEN_PATTERN =
  /—|access_token|refresh_token|nonce|WWW-Authenticate|insufficient_scope/;

const messages = [
  ["connected", "Xero is connected."],
  ["not_connected", "Connect Xero to sync your payroll data."],
  ["disconnect_pending", "Sync stopped. Xero disconnection is pending."],
  ["reauthorisation_required", "Xero access needs to be renewed."],
  ["reauthorise", "Xero access needs to be renewed."],
  ["update_permissions", "Update Xero permissions to continue."],
  [
    "access_denied",
    "Xero declined this request. Check that the person who connected Xero still has payroll access.",
  ],
  ["retry_later", "Xero is temporarily unavailable. Try again later."],
  [
    "outcome_unknown",
    "We could not confirm whether Xero received this change. Check Xero before trying again.",
  ],
  [
    "operational_incident",
    "We cannot reach Xero right now. Try again later or contact support.",
  ],
  [
    "unavailable",
    "We cannot reach Xero right now. Try again later or contact support.",
  ],
] as const;
describe("XeroRecoveryNotice", () => {
  afterEach(cleanup);
  it.each(messages)("renders truthful recovery for %s", (reason, message) => {
    const { container } = render(<XeroRecoveryNotice reason={reason} />);
    expect(screen.getByRole("status").textContent).toBe(message);
    expect(container.textContent).not.toContain("Our team has been notified");
    expect(container.textContent).not.toMatch(FORBIDDEN_PATTERN);
  });
  it("formats rate-limit retry time in the viewer's local time", () => {
    const now = new Date("2026-09-26T09:00:00.000Z");
    const retryAfterMs = 15 * 60_000;
    const time = new Date("2026-09-26T09:15:00.000Z").toLocaleTimeString(
      "en-AU",
      { hour: "numeric", minute: "2-digit" }
    );
    render(
      <XeroRecoveryNotice
        now={now}
        reason="retry_later"
        retryAfterMs={retryAfterMs}
      />
    );
    expect(screen.getByRole("status").textContent).toBe(
      `Xero is temporarily unavailable. Try again after ${time}.`
    );
  });
});
