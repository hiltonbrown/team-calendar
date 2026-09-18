import type { PublicStatusSnapshot } from "@repo/observability/status";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/observability/status", () => ({
  getPublicStatus: vi.fn(),
  publicComponentNames: [
    "App access",
    "Xero connection and synchronisation",
    "Calendar feed delivery",
    "In-app notifications",
    "Email notifications",
  ],
}));

import {
  statusIncidentMailtoHref,
  supportEmail,
  supportHoursLong,
} from "@/src/data/support";
import { metadata, StatusContent } from "./page";

const snapshot: PublicStatusSnapshot = {
  activeIncidents: [],
  checkedAt: "2026-08-30T01:00:00.000Z",
  components: [
    { name: "App access", state: "operational" },
    { name: "Xero connection and synchronisation", state: "operational" },
    { name: "Calendar feed delivery", state: "operational" },
    { name: "In-app notifications", state: "operational" },
    { name: "Email notifications", state: "operational" },
  ],
  hostedStatusPageUrl: "https://status.example.com",
  incidentAvailability: "available",
  overallState: "operational",
  recentIncidents: [],
  subscribable: true,
};

const renderSuccess = (value: PublicStatusSnapshot = snapshot) =>
  renderToStaticMarkup(<StatusContent result={{ ok: true, value }} />);

describe("public status page", () => {
  it("renders one focusable main, one h1, and the required reading order", () => {
    const html = renderSuccess();
    const headings = [
      "Team Calendar status",
      "Current status by service",
      "Active incidents",
      "Recent incidents",
      "Report an issue",
    ];

    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain('id="status-main"');
    expect(html).toContain('tabindex="-1"');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(headings.map((heading) => html.indexOf(heading))).toEqual(
      [...headings.map((heading) => html.indexOf(heading))].sort(
        (a, b) => a - b
      )
    );
  });

  it("renders exactly five services in their canonical order", () => {
    const html = renderSuccess();
    expect(html.match(/data-status-component="true"/g)).toHaveLength(5);
    expect(snapshot.components.map(({ name }) => html.indexOf(name))).toEqual(
      [...snapshot.components.map(({ name }) => html.indexOf(name))].sort(
        (a, b) => a - b
      )
    );
    expect(html).not.toContain("organisation switching");
    expect(html).not.toContain("availability normalisation");
    expect(html).not.toContain(">ICS<");
  });

  it("pairs every component state with an icon and plain label", () => {
    const html = renderSuccess({
      ...snapshot,
      components: [
        { name: "App access", state: "operational" },
        { name: "Xero connection and synchronisation", state: "degraded" },
        { name: "Calendar feed delivery", state: "outage" },
        { name: "In-app notifications", state: "maintenance" },
        { name: "Email notifications", state: "unknown" },
      ],
      overallState: "partial_outage",
    });

    expect(html).toContain("Operational");
    expect(html).toContain("Degraded performance");
    expect(html).toContain("Outage");
    expect(html).toContain("Maintenance");
    expect(html).toContain("Unknown");
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("distinguishes a successful empty incident list from unavailable history", () => {
    const success = renderSuccess();
    const unavailable = renderSuccess({
      ...snapshot,
      incidentAvailability: "unavailable",
    });

    expect(success).toContain("No active incidents reported");
    expect(success).toContain("No recent incidents reported");
    expect(unavailable).toContain(
      "Incident history is temporarily unavailable"
    );
    expect(unavailable).not.toContain("No active incidents reported");
  });

  it("renders incident types, affected services, and semantic update times", () => {
    const html = renderSuccess({
      ...snapshot,
      activeIncidents: [
        {
          affectedComponents: ["App access"],
          resolvedAt: null,
          startedAt: "2026-08-30T00:00:00.000Z",
          state: "active",
          title: "Sign-in interruption",
          updates: [
            {
              message: "We are investigating sign-in failures.",
              publishedAt: "2026-08-30T00:10:00.000Z",
            },
          ],
        },
      ],
      recentIncidents: [
        {
          affectedComponents: ["Calendar feed delivery"],
          resolvedAt: "2026-08-29T03:00:00.000Z",
          startedAt: "2026-08-29T01:00:00.000Z",
          state: "resolved",
          title: "Feed delivery delay",
          updates: [],
        },
      ],
    });

    expect(html).toContain("Active incident");
    expect(html).toContain("Resolved");
    expect(html).toContain("Affected:</strong> App access");
    expect(html).toContain('dateTime="2026-08-30T00:10:00.000Z"');
    expect(html).toContain("We are investigating sign-in failures.");
  });

  it("renders a truthful Unknown recovery page after provider failure", () => {
    const html = renderToStaticMarkup(
      <StatusContent
        result={{
          error: {
            code: "provider",
            hostedStatusPageUrl: "https://status.example.com",
            message: "Status information is temporarily unavailable.",
          },
          ok: false,
        }}
      />
    );

    expect(html).toContain("Status unknown");
    expect(html).toContain("No verified check time available");
    expect(html.match(/Unknown/g)?.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain("View hosted status");
    expect(html).toContain("Incident history is temporarily unavailable");
  });

  it("shows subscription only when supported", () => {
    expect(renderSuccess()).toContain("Subscribe to updates");
    expect(renderSuccess({ ...snapshot, subscribable: false })).not.toContain(
      "Subscribe to updates"
    );
  });

  it("keeps support details and sensitive-data guidance visible", () => {
    const html = renderSuccess();
    expect(html).toContain(supportEmail);
    expect(html).toContain(supportHoursLong);
    expect(html).toContain("not a guaranteed resolution time");
    expect(html).toContain("Do not include payroll data");
    expect(html).toContain(statusIncidentMailtoHref.replaceAll("&", "&amp;"));
  });

  it("publishes canonical and Open Graph metadata", () => {
    expect(metadata.alternates).toEqual({ canonical: "/status" });
    expect(metadata.openGraph).toMatchObject({ url: "/status" });
  });
});
