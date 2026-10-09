import { describe, expect, it } from "vitest";
import { buildProviderLinks } from "./provider-links";

const url = "https://api.example.test/ical/tc1.abc.def.ics";

describe("buildProviderLinks", () => {
  it("hands Apple and Outlook desktop the webcal form of the URL", () => {
    const links = buildProviderLinks(url);
    expect(links.apple).toEqual({
      href: "webcal://api.example.test/ical/tc1.abc.def.ics",
      kind: "open",
    });
    expect(links.outlookDesktop).toEqual(links.apple);
  });

  it("converts http URLs to webcal too", () => {
    expect(
      buildProviderLinks("http://localhost:3002/ical/tc1.x.y.ics").apple.href
    ).toBe("webcal://localhost:3002/ical/tc1.x.y.ics");
  });

  it("copies the exact URL before opening Google and Outlook web setup pages", () => {
    const links = buildProviderLinks(url);
    expect(links.google).toEqual({
      copy: url,
      href: "https://calendar.google.com/calendar/u/0/r/settings/addbyurl",
      kind: "copy_then_open",
    });
    expect(links.outlookWeb).toEqual({
      copy: url,
      href: "https://outlook.office.com/calendar/addcalendar",
      kind: "copy_then_open",
    });
  });

  it("never alters the URL beyond its scheme", () => {
    const tricky = "https://api.example.test/ical/tc1.a-b_c.d%2Fe.ics?x=1&y=2";
    const links = buildProviderLinks(tricky);
    expect(links.apple.href).toBe(
      "webcal://api.example.test/ical/tc1.a-b_c.d%2Fe.ics?x=1&y=2"
    );
    expect(links.google.kind === "copy_then_open" && links.google.copy).toBe(
      tricky
    );
  });
});
