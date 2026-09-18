import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/customers" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("@repo/design-system/components/mode-toggle", () => ({
  ModeToggle: () => React.createElement("button", { type: "button" }, "Theme"),
}));

import { Header } from "./index";

describe("Marketing header bypass link", () => {
  beforeEach(() => {
    navigation.pathname = "/customers";
  });

  it("places the customers skip link before repeated header content", () => {
    const html = renderToStaticMarkup(React.createElement(Header));
    const skipIndex = html.indexOf('href="#customers-main"');
    const headerIndex = html.indexOf('<header class="marketing-site-header"');

    expect(skipIndex).toBeGreaterThan(-1);
    expect(html).toContain("Skip to main content");
    expect(skipIndex).toBeLessThan(headerIndex);
  });

  it("handles a trailing slash", () => {
    navigation.pathname = "/customers/";

    const html = renderToStaticMarkup(React.createElement(Header));

    expect(html).toContain('href="#customers-main"');
  });

  it("does not add a broken customers target on another route", () => {
    navigation.pathname = "/features";

    const html = renderToStaticMarkup(React.createElement(Header));

    expect(html).not.toContain("#customers-main");
    expect(html).not.toContain("Skip to main content");
  });

  it("renders only the focused menu in every navigation variant", () => {
    navigation.pathname = "/integrations";

    const html = renderToStaticMarkup(React.createElement(Header));

    expect(html.match(/href="\/"/g)).toHaveLength(4);
    expect(html.match(/href="\/features"/g)).toHaveLength(3);
    expect(html.match(/href="\/integrations"/g)).toHaveLength(3);
    expect(html.match(/href="\/pricing"/g)).toHaveLength(3);
    expect(html).not.toContain('href="/about"');
    expect(html).not.toContain('href="/blog"');
    expect(html).not.toContain('href="/help-centre"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(3);
  });

  it.each(["/help-centre", "/help-centre/onboarding"])(
    "keeps the Help centre bypass target without restoring it to the menu on %s",
    (pathname) => {
      navigation.pathname = pathname;

      const html = renderToStaticMarkup(React.createElement(Header));
      const skipIndex = html.indexOf('href="#help-centre-main"');
      const headerIndex = html.indexOf('<header class="marketing-site-header"');

      expect(html).not.toContain('href="/help-centre"');
      expect(html).not.toContain('aria-current="page"');
      expect(skipIndex).toBeGreaterThan(-1);
      expect(skipIndex).toBeLessThan(headerIndex);
    }
  );

  it.each(["/blog", "/blog/ics-feeds-explained"])(
    "keeps the Blog bypass target without restoring it to the menu on %s",
    (pathname) => {
      navigation.pathname = pathname;

      const html = renderToStaticMarkup(React.createElement(Header));

      expect(html).not.toContain('href="/blog"');
      expect(html).not.toContain('aria-current="page"');
      expect(html).toContain('href="#blog-main"');
    }
  );

  it("keeps the About bypass target without restoring it to the menu", () => {
    navigation.pathname = "/about";

    const html = renderToStaticMarkup(React.createElement(Header));
    const skipIndex = html.indexOf('href="#about-main"');
    const headerIndex = html.indexOf('<header class="marketing-site-header"');

    expect(html).not.toContain('href="/about"');
    expect(html).not.toContain('aria-current="page"');
    expect(skipIndex).toBeGreaterThan(-1);
    expect(skipIndex).toBeLessThan(headerIndex);
  });

  it.each(["/careers", "/careers/"])(
    "targets the Careers main on %s without changing primary membership",
    (pathname) => {
      navigation.pathname = pathname;

      const html = renderToStaticMarkup(React.createElement(Header));

      expect(html).toContain('href="#careers-main"');
      expect(html).not.toContain('href="/careers"');
    }
  );
});
