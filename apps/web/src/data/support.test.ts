import { primaryDomain } from "@repo/seo/branding";
import { describe, expect, it } from "vitest";
import {
  statusIncidentMailtoHref,
  supportEmail,
  supportHoursCompact,
  supportHoursLong,
  supportMailtoHref,
} from "./support";

describe("public support details", () => {
  it("derives the support address from the primary domain", () => {
    expect(supportEmail).toBe(`support@${primaryDomain}`);
  });

  it("provides a prefilled early access enquiry", () => {
    const mailto = new URL(supportMailtoHref);
    const body = mailto.searchParams.get("body");

    expect(mailto.searchParams.get("subject")).toBe(
      "Team Calendar early access enquiry"
    );
    expect(body).toContain("Organisation name:");
    expect(body).toContain("Team size:");
    expect(body).toContain("Xero Payroll region:");
    expect(body).toContain("Help needed:");
  });

  it("keeps long and compact hours semantically consistent", () => {
    expect(supportHoursLong).toBe("Monday to Friday, 9:00 am to 5:00 pm AEST");
    expect(supportHoursCompact).toBe("Mon–Fri, 9 am–5 pm AEST");
  });

  it("provides a safely prefilled status incident report", () => {
    const mailto = new URL(statusIncidentMailtoHref);
    const body = mailto.searchParams.get("body");

    expect(mailto.searchParams.get("subject")).toBe(
      "Team Calendar service issue"
    );
    expect(body).toContain("Organisation name:");
    expect(body).toContain("Affected component:");
    expect(body).toContain("Issue start time and timezone:");
    expect(body).toContain("Symptom or customer impact:");
  });
});
