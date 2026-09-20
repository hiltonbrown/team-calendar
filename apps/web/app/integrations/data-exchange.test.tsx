// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataExchange } from "./data-exchange";

afterEach(cleanup);

describe("integration data exchange", () => {
  it("switches direction while keeping both record lists and exclusions available", () => {
    render(<DataExchange />);
    const reads = screen.getByRole("button", { name: "Reads from Xero" });
    const writes = screen.getByRole("button", { name: "Writes to Xero" });
    expect(reads.getAttribute("aria-pressed")).toBe("true");
    expect(writes.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(writes);
    expect(reads.getAttribute("aria-pressed")).toBe("false");
    expect(writes.getAttribute("aria-pressed")).toBe("true");
    const list = document.getElementById(
      writes.getAttribute("aria-controls") ?? ""
    );
    expect(list?.textContent).toContain(
      "Manager approval and decline decisions"
    );
    expect(
      screen.getByText("Employee records and employment status")
    ).toBeTruthy();
    expect(screen.getByText("Personal calendar contents")).toBeTruthy();
    expect(
      screen.getByRole("complementary", { name: "Never reads" })
    ).toBeTruthy();

    fireEvent.click(reads);
    expect(reads.getAttribute("aria-pressed")).toBe("true");
    expect(writes.getAttribute("aria-pressed")).toBe("false");
  });
});
