// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/image", () => ({
  default: () => null,
}));

vi.mock("@repo/design-system/components/mode-toggle", () => ({
  ModeToggle: () => <button type="button">Theme</button>,
}));

import { Header } from "./index";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("Marketing header keyboard interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root.render(<Header />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("returns focus to the mobile menu trigger when Escape closes the menu", () => {
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-controls="marketing-mobile-navigation"]'
    );
    if (!trigger) {
      throw new Error("Expected the mobile menu trigger to render");
    }

    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const mobileLink = container.querySelector<HTMLAnchorElement>(
      '#marketing-mobile-navigation a[href="/features"]'
    );
    mobileLink?.focus();
    expect(document.activeElement).toBe(mobileLink);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps link navigation close behaviour without moving focus", () => {
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-controls="marketing-mobile-navigation"]'
    );
    if (!trigger) {
      throw new Error("Expected the mobile menu trigger to render");
    }

    act(() => trigger.click());
    const mobileLink = container.querySelector<HTMLAnchorElement>(
      '#marketing-mobile-navigation a[href="/features"]'
    );
    if (!mobileLink) {
      throw new Error("Expected the mobile Features link to render");
    }
    mobileLink.addEventListener("click", (event) => event.preventDefault());
    mobileLink.focus();

    act(() => mobileLink.click());

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(mobileLink);
  });
});
