import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HowItWorksSection } from "./how-it-works-section";

describe("HowItWorksSection", () => {
  it("uses the simplified workflow heading", () => {
    const html = renderToStaticMarkup(<HowItWorksSection />);

    expect(html).toContain("One easy workflow");
    expect(html).not.toContain("Four steps. One calm workflow.");
  });
});
