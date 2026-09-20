import { readdirSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FeaturesPage from "../features/page";
import { Footer } from "./footer";

describe("Marketing footer", () => {
  it("links every static public page and resolves feature fragments", () => {
    const html = renderToStaticMarkup(React.createElement(Footer));
    const hrefs = [...html.matchAll(/href="(\/[^"]*)"/g)].map(
      (match) => match[1]
    );
    const appDirectory = path.resolve(import.meta.dirname, "..");
    const routes = readdirSync(appDirectory, { recursive: true })
      .filter((entry): entry is string => typeof entry === "string")
      .filter((entry) => entry.endsWith("page.tsx") && !entry.includes("["))
      .map(
        (entry) =>
          `/${path
            .dirname(entry)
            .split(path.sep)
            .filter((part) => part !== "." && !part.startsWith("("))
            .join("/")}`
      );

    for (const route of routes) {
      expect(hrefs, `Missing footer route ${route}`).toContain(route);
    }
    for (const href of hrefs) {
      expect(routes).toContain(href.split("#")[0]);
    }
    const features = renderToStaticMarkup(React.createElement(FeaturesPage));
    for (const href of hrefs.filter((value) =>
      value.startsWith("/features#")
    )) {
      expect(features).toContain(`id="${href.split("#")[1]}"`);
    }
  });

  it("keeps the customers route under its truthful label", () => {
    const html = renderToStaticMarkup(React.createElement(Footer));

    expect(html).toContain('href="/customers">Who it’s for</a>');
    expect(html).not.toContain('href="/customers">Customers</a>');
  });
});
