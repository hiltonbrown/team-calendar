// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EarlyAccessApplicationForm } from "./components/early-access-application-form";

const retentionPattern = /removed after 90 days/;
const attachmentWarningPattern = /Do not include or attach payroll records/;

const fill = () => {
  fireEvent.change(screen.getByLabelText("Work email"), {
    target: { value: "owner@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Company size"), {
    target: { value: "8-30" },
  });
  fireEvent.change(
    screen.getByLabelText("Do you use Xero Payroll Australia?"),
    { target: { value: "yes" } }
  );
  fireEvent.change(screen.getByLabelText("Primary calendar"), {
    target: { value: "google" },
  });
  fireEvent.change(
    screen.getByLabelText("How do you manage leave and availability today?"),
    { target: { value: "A shared spreadsheet and email." } }
  );
  fireEvent.change(
    screen.getByLabelText("How did you hear about Team Calendar?"),
    { target: { value: "Xero community" } }
  );
};

describe("early access application form", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    vi.stubGlobal("crypto", { randomUUID: () => "request-1" });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is keyboard-submittable and shows the accepted reference", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ reference: "EA-1234" }), {
          status: 202,
        })
      )
    );
    render(<EarlyAccessApplicationForm />);
    fill();
    fireEvent.submit(
      screen.getByRole("form", { name: "Early access application" })
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "EA-1234"
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/early-access",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows a useful retry state after provider failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Please try again shortly." }), {
          status: 503,
        })
      )
    );
    render(<EarlyAccessApplicationForm />);
    fill();
    fireEvent.submit(
      screen.getByRole("form", { name: "Early access application" })
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Please try again shortly."
      )
    );
  });

  it("contains no attachment input and states purpose and retention", () => {
    render(<EarlyAccessApplicationForm />);
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByText(retentionPattern)).toBeDefined();
    expect(screen.getByText(attachmentWarningPattern)).toBeDefined();
  });
});
