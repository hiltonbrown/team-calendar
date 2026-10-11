import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanySelector } from "./company-selector";

const mocks = vi.hoisted(() => ({
  pathname: "/people",
  push: vi.fn(),
  query: "team=team-1&org=company-a",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
const companies = [
  { id: "company-a", name: "Acme Restaurants" },
  { id: "company-b", name: "Acme Hotels" },
];
describe("CompanySelector", () => {
  beforeEach(() => {
    mocks.pathname = "/people";
    mocks.query = "team=team-1&org=company-a";
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  it("hides the selector with only one company", () => {
    render(<CompanySelector companies={companies.slice(0, 1)} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
  it("keeps account-wide calendar and integration pages free of the scoped selector", () => {
    mocks.pathname = "/calendar";
    render(<CompanySelector companies={companies} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
  it("shows company names separately from the Clerk account and preserves query filters", async () => {
    render(<CompanySelector companies={companies} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Company" }));
    fireEvent.click(screen.getByRole("option", { name: "Acme Hotels" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/people?team=team-1&org=company-b"
      )
    );
  });
});
