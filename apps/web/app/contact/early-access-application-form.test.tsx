// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
    {
      target: { value: "yes" },
    }
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
    {
      target: { value: "Xero community" },
    }
  );
};
const submit = () => {
  fireEvent.submit(
    screen.getByRole("form", { name: "Early access application" })
  );
};
const confirm = () => {
  const dialog = screen.getByRole("alertdialog", {
    name: "Submit your application?",
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Submit application" })
  );
};
const acceptedResponse = () =>
  new Response(JSON.stringify({ reference: "EA-1234" }), { status: 202 });

describe("early access application form", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("request-1"),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(acceptedResponse()));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("requires confirmation before sending a keyboard-submitted application", async () => {
    render(<EarlyAccessApplicationForm />);
    fill();
    submit();
    expect(fetch).not.toHaveBeenCalled();
    confirm();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("EA-1234")
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/early-access",
      expect.objectContaining({
        body: expect.any(String),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "request-1",
        },
        method: "POST",
      })
    );
    const requestBody = vi.mocked(fetch).mock.calls[0]?.[1]?.body;
    expect(typeof requestBody).toBe("string");
    expect(JSON.parse(String(requestBody))).toEqual({
      calendarClient: "google",
      companySize: "8-30",
      country: "AU",
      currentProcess: "A shared spreadsheet and email.",
      email: "owner@example.com",
      heardFrom: "Xero community",
      usesXeroPayroll: "yes",
    });
    expect(screen.getByLabelText<HTMLInputElement>("Work email").value).toBe(
      ""
    );
  });

  it("keeps the application when confirmation is cancelled", () => {
    render(<EarlyAccessApplicationForm />);
    fill();
    submit();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLInputElement>("Work email").value).toBe(
      "owner@example.com"
    );
    submit();
    expect(screen.getByRole("alertdialog")).toBeDefined();
  });

  it("does not confirm or submit incomplete or invalid applications", () => {
    render(<EarlyAccessApplicationForm />);
    submit();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fill();
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "not-an-email" },
    });
    submit();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("explains eligibility without submitting when Xero Payroll Australia is not used", () => {
    render(<EarlyAccessApplicationForm />);
    fill();
    fireEvent.change(
      screen.getByLabelText("Do you use Xero Payroll Australia?"),
      {
        target: { value: "no" },
      }
    );
    submit();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "Early access is currently available only to organisations using Xero Payroll Australia."
    );
    expect(screen.getByLabelText<HTMLInputElement>("Work email").value).toBe(
      "owner@example.com"
    );
  });

  it("prevents duplicate requests while a confirmed application is pending", async () => {
    let resolveDelivery: (response: Response) => void = () => undefined;
    const delivery = new Promise<Response>((resolve) => {
      resolveDelivery = resolve;
    });
    vi.mocked(fetch).mockReturnValue(delivery);
    render(<EarlyAccessApplicationForm />);
    fill();
    submit();
    const confirmation = screen.getByRole("button", {
      name: "Submit application",
    });
    fireEvent.click(confirmation);
    fireEvent.click(confirmation);
    fireEvent.submit(document.querySelector("form") ?? document.body);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveDelivery(acceptedResponse());
      await delivery;
    });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("EA-1234")
    );
  });

  it("preserves input and shows the server's retry message after delivery failure", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Please try again shortly." }), {
        status: 503,
      })
    );
    render(<EarlyAccessApplicationForm />);
    fill();
    submit();
    confirm();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Please try again shortly."
      )
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>("Work email").value).toBe(
      "owner@example.com"
    );
  });

  it("can retry a network failure without duplicating an unchanged application", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(acceptedResponse());
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000001")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000002");
    render(<EarlyAccessApplicationForm />);
    fill();
    submit();
    confirm();
    await screen.findByRole("alert");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    submit();
    confirm();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("EA-1234")
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    const [first, retry] = vi.mocked(fetch).mock.calls;
    expect(retry?.[1]?.headers).toEqual(first?.[1]?.headers);
    expect(retry?.[1]?.body).toBe(first?.[1]?.body);
  });

  it("uses a new request key when application details change after a failure", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(acceptedResponse());
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000001")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000002");
    render(<EarlyAccessApplicationForm />);
    fill();
    submit();
    confirm();
    await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText("Company size"), {
      target: { value: "31-75" },
    });
    submit();
    confirm();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("EA-1234")
    );
    const [first, retry] = vi.mocked(fetch).mock.calls;
    expect(retry?.[1]?.headers).not.toEqual(first?.[1]?.headers);
    expect(retry?.[1]?.body).not.toBe(first?.[1]?.body);
  });

  it("contains no attachment input and states purpose and retention", () => {
    render(<EarlyAccessApplicationForm />);
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByText(retentionPattern)).toBeDefined();
    expect(screen.getByText(attachmentWarningPattern)).toBeDefined();
  });
});
