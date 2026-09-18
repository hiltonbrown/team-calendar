import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeneralClient } from "./general-client";

vi.mock("./_actions", () => ({
  updateAccountNameAction: vi.fn(),
  updateOrganisationAction: vi.fn(),
}));

const CONFIRM_COUNTRY_REGEX = /Confirm changing/i;

describe("GeneralClient", () => {
  afterEach(cleanup);

  it("presents country as truthful read-only context", () => {
    render(
      <GeneralClient
        account={{ name: "Acme Group", slug: "acme" }}
        organisation={{
          countryCode: "AU",
          id: "70000000-0000-4000-8000-000000000001",
          name: "Acme Payroll",
          regionCode: "QLD",
          timezone: "Australia/Brisbane",
        }}
      />
    );

    const country = screen.getByRole("textbox", { name: "Country" });
    expect(country.getAttribute("value")).toBe("Australia");
    expect(country.hasAttribute("readonly")).toBe(true);
    expect(
      screen.getByText(
        "Country cannot be changed here. New Zealand and United Kingdom payroll sync remain planned."
      )
    ).toBeDefined();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(CONFIRM_COUNTRY_REGEX)).toBeNull();
  });
});
