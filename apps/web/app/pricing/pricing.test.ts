import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PricingExperience } from "./components/pricing-experience";
import { getCurrencyPricingState } from "./constants";

vi.mock("server-only", () => ({}));
const numericCurrencyPattern = /[£$][0-9]/;

const renderMode = (mode: "early_access" | "paid") =>
  renderToStaticMarkup(React.createElement(PricingExperience, { mode }));

describe("pricing experience", () => {
  it("renders one coherent closed early-access decision", () => {
    const html = renderMode("early_access");
    expect(html).toContain("closed, guided cohort");
    expect(html).toContain("Enquire about early access");
    expect(html.match(/marketing-btn--primary/g)).toHaveLength(1);
    expect(html).not.toContain("$9");
    expect(html).not.toContain("Compare Australian plans");
    expect(html).not.toContain("Get started");
  });

  it("renders the exact paid AUD plan contract", () => {
    const html = renderMode("paid");
    for (const value of [
      "Starter",
      "$9",
      "Up to 9 staff",
      "Core Feed",
      "Basic Analytics",
      "Standard Support",
      "Premium",
      "$19",
      "Up to 50 staff",
      "Team and location feeds",
      "Advanced Analytics",
      "Priority support",
      "Enterprise",
      "Multiple Xero connections",
      "Coming soon",
    ]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain("$49");
    expect(html).not.toContain("Up to 10");
    expect(html).not.toContain("2 Xero");
    expect(html.match(/Get started/g)).toHaveLength(2);
  });

  it("provides accessible comparison and native FAQ semantics", () => {
    const html = renderMode("paid");
    expect(html).toContain("<caption>");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).not.toContain("aria-expanded");
  });

  it("keeps NZD and GBP as non-purchase availability states", () => {
    expect(getCurrencyPricingState("AUD")).toMatchObject({
      available: true,
      currency: "AUD",
    });
    expect(getCurrencyPricingState("NZD")).toMatchObject({
      available: false,
      heading: "New Zealand pricing is coming soon",
    });
    expect(getCurrencyPricingState("GBP")).toMatchObject({
      available: false,
      heading: "United Kingdom pricing is coming soon",
    });
    expect(
      JSON.stringify([
        getCurrencyPricingState("NZD"),
        getCurrencyPricingState("GBP"),
      ])
    ).not.toMatch(numericCurrencyPattern);
  });

  it("keeps the route static and isolates the client boundary", () => {
    const directory = resolve(import.meta.dirname);
    const page = readFileSync(resolve(directory, "page.tsx"), "utf8");
    const components = resolve(directory, "components");
    const files = [
      "pricing-experience.tsx",
      "pricing-plans.tsx",
      "pricing-comparison.tsx",
      "pricing-faq.tsx",
      "pricing-currency-selector.tsx",
    ];
    expect(page).not.toContain("force-dynamic");
    expect(
      files.filter((file) =>
        readFileSync(resolve(components, file), "utf8").includes('"use client"')
      )
    ).toEqual(["pricing-currency-selector.tsx"]);
  });
});
