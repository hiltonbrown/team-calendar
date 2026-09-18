import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Footer } from "./footer";

describe("Marketing footer", () => {
  it("keeps the customers route under its truthful label", () => {
    const html = renderToStaticMarkup(React.createElement(Footer));

    expect(html).toContain('href="/customers">Who it’s for</a>');
    expect(html).not.toContain('href="/customers">Customers</a>');
  });
});
