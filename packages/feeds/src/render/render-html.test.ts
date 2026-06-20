import { describe, expect, it } from "vitest";
import type { PreviewEvent } from "../projection/feed-projection";
import { renderFeedHtml } from "./render-html";

describe("renderFeedHtml", () => {
  it("renders masked projected events without unmasking private source details", () => {
    const html = renderFeedHtml({
      events: [maskedProjectedEvent()],
      feedName: "Team availability",
      generatedAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(html).toContain("Team member: Annual Leave");
    expect(html).toContain("Annual Leave");
    expect(html).toContain("Brisbane");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("Jane Smith");
    expect(html).not.toContain("Internal note");
  });

  it("escapes projected text before writing it into HTML", () => {
    const html = renderFeedHtml({
      events: [
        {
          ...maskedProjectedEvent(),
          location: "<script>alert('location')</script>",
          summary: "Team member: Training <script>",
        },
      ],
      feedName: "Team <Availability>",
      generatedAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(html).toContain("Team &lt;Availability&gt;");
    expect(html).toContain("Team member: Training &lt;script&gt;");
    expect(html).toContain(
      "&lt;script&gt;alert(&#39;location&#39;)&lt;/script&gt;"
    );
    expect(html).not.toContain("<script>");
  });
});

function maskedProjectedEvent(): PreviewEvent {
  return {
    allDay: true,
    contactabilityStatus: "unavailable",
    description: null,
    displayName: "Team member",
    endsAt: new Date("2026-05-08T00:00:00.000Z"),
    isPublicHoliday: false,
    location: "Brisbane",
    publishedSequence: 3,
    publishedUid: "published@ical.leavesync.app",
    recordType: "annual_leave",
    sourceRecordId: "10000000-0000-4000-8000-000000000001",
    startsAt: new Date("2026-05-07T00:00:00.000Z"),
    summary: "Team member: Annual Leave",
  };
}
