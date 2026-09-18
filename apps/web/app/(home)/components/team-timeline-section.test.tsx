import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamTimelineSection } from "./team-timeline-section";

const mobileBlockTargetPattern = /\.tl-block \{\s+height: 44px;/;
const mobileNavTargetPattern = /\.tl-nav-btn \{\s+width: 44px;\s+height: 44px;/;
const mobileTodayTargetPattern = /\.tl-today-btn \{\s+height: 44px;/;

describe("TeamTimelineSection branch and live contract", () => {
  it("keeps the current interaction copy and mobile scroll affordance", () => {
    const html = renderToStaticMarkup(<TeamTimelineSection />);

    expect(html).toContain("See who is in, who is out and where they are.");
    expect(html).toContain("Select any entry for details.");
    expect(html).toContain("Swipe to see the full week");
    expect(html).not.toContain("Team availability, live");
    expect(html).not.toContain("Click any block for details.");
  });

  it("keeps visible interaction feedback and accessible mobile targets", () => {
    const styles = readFileSync(
      new URL("../../styles/home.css", import.meta.url),
      "utf8"
    );
    const blockRule = styles.slice(
      styles.indexOf(".tl-block {"),
      styles.indexOf(".tl-block:focus-visible")
    );

    expect(styles).toContain(".tl-scrollhint");
    expect(blockRule).toContain("box-shadow:");
    expect(blockRule).toContain("transform");
    expect(styles).toContain(".tl-block:active");
    expect(styles).toMatch(mobileBlockTargetPattern);
    expect(styles).toMatch(mobileNavTargetPattern);
    expect(styles).toMatch(mobileTodayTargetPattern);
  });
});
