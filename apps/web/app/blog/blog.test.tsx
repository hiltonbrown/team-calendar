import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/blog", () => ({
  getAllPosts: vi.fn(() => []),
}));

import BlogIndex from "./page";

describe("Blog index read surface", () => {
  it("has one focusable main and names its practical knowledge job", async () => {
    const html = renderToStaticMarkup(await BlogIndex());

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain('id="blog-main"');
    expect(html).toContain('tabindex="-1"');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Xero Payroll leave");
    expect(html).toContain("secure calendar feeds");
    expect(html).toContain("No guides published yet");
  });
});
