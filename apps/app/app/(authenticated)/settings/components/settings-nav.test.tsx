import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsNav } from "./settings-nav";

const navigation = vi.hoisted(() => ({
  pathname: "/settings/integrations/xero",
  searchParams: new URLSearchParams("org=70000000-0000-4000-8000-000000000099"),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
}));

describe("SettingsNav", () => {
  afterEach(() => {
    cleanup();
    navigation.pathname = "/settings/integrations/xero";
    navigation.searchParams = new URLSearchParams(
      "org=70000000-0000-4000-8000-000000000099"
    );
  });

  it("preserves the exact query organisation on every destination", () => {
    render(
      <SettingsNav orgQueryValue="70000000-0000-4000-8000-000000000001" />
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(9);
    for (const link of links) {
      expect(link.getAttribute("href")).toContain(
        "org=70000000-0000-4000-8000-000000000099"
      );
    }
    for (const activeLink of screen.getAllByRole("link", {
      name: "Integrations",
    })) {
      expect(activeLink.getAttribute("aria-current")).toBe("page");
    }
  });

  it("uses the resolved fallback organisation when the URL has no org", () => {
    navigation.searchParams = new URLSearchParams();
    render(
      <SettingsNav orgQueryValue="70000000-0000-4000-8000-000000000001" />
    );

    expect(
      screen.getAllByRole("link", { name: "General" })[0]?.getAttribute("href")
    ).toBe("/settings/general?org=70000000-0000-4000-8000-000000000001");
  });

  it("opens a labelled mobile navigator and returns focus on close", async () => {
    render(
      <SettingsNav orgQueryValue="70000000-0000-4000-8000-000000000001" />
    );
    const trigger = screen.getByRole("button", {
      name: "Open Settings navigation",
    });

    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(within(dialog).getByText("Organisation")).toBeDefined();
    expect(within(dialog).getByText("Publishing")).toBeDefined();
    expect(within(dialog).getByText("Operations")).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
