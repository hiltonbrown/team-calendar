import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BlogErrorContent } from "./error";

describe("Blog error state", () => {
  it("offers recovery without technical details", () => {
    const html = renderToStaticMarkup(
      React.createElement(BlogErrorContent, { reset: vi.fn() })
    );

    expect(html).toContain("Try again");
    expect(html).toContain('href="/blog"');
    expect(html).toContain('id="blog-main"');
    expect(html).not.toContain("digest");
    expect(html).not.toContain("stack");
  });
});
