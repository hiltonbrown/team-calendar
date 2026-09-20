// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactPageContent } from "./components/contact-page-content";

const enquiryPattern = /Make an enquiry/;
const supportPattern = /Get support/;
const bugPattern = /Report a bug/;
const confirmationPattern = /Email me a confirmation/;
const name = "Test Visitor";
const email = "visitor@example.com";
const message = "I would like to learn more about Team Calendar.";
const acceptedResponse = (confirmation = "not-requested") =>
  new Response(JSON.stringify({ confirmation, reference: "TC-1234" }), {
    status: 202,
  });
const fillShared = () => {
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: email },
  });
};
const fillMessage = (label = "Your message", value = message) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};
const submit = () => fireEvent.submit(screen.getByRole("form"));
const expectReceipt = async () => {
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("TC-1234")
  );
};
const bodyAt = (index = 0) =>
  JSON.parse(String(vi.mocked(fetch).mock.calls[index]?.[1]?.body));

describe("adaptive contact form", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("request-1"),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(acceptedResponse()))
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("preserves separate drafts and shared identity when changing reason", () => {
    render(<ContactPageContent />);
    fillShared();
    fillMessage();
    fireEvent.click(screen.getByRole("radio", { name: supportPattern }));
    fillMessage("What do you need help with?", "I need help with my calendar.");
    fireEvent.click(screen.getByRole("radio", { name: enquiryPattern }));
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("Your message").value
    ).toBe(message);
    expect(screen.getByLabelText<HTMLInputElement>("Your name").value).toBe(
      name
    );
    fireEvent.click(screen.getByRole("radio", { name: supportPattern }));
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("What do you need help with?")
        .value
    ).toBe("I need help with my calendar.");
  });

  it.each([
    { label: "Your message", type: "enquiry" },
    { label: "What do you need help with?", type: "support" },
    { label: "What happened, and what did you expect?", type: "bug" },
  ] as const)(
    "sends the $type contract with confirmation explicitly disabled by default",
    async ({ type, label }) => {
      render(<ContactPageContent initialType={type} />);
      fillShared();
      fillMessage(label);
      submit();
      await expectReceipt();
      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/contact",
        expect.objectContaining({ method: "POST" })
      );
      expect(bodyAt()).toEqual({
        email,
        message,
        name,
        organisation: "",
        sendConfirmation: false,
        type,
        ...(type === "bug" ? { browser: "", pageUrl: "", steps: "" } : {}),
      });
      expect(screen.getByRole("status").textContent).toContain(
        "No confirmation email was requested"
      );
    }
  );

  it("submits eligible early access fields without leaking another reason's inputs", async () => {
    render(<ContactPageContent initialType="early-access" />);
    fillShared();
    fillMessage("How do you manage leave and availability today?");
    fireEvent.change(screen.getByLabelText("Team size"), {
      target: { value: "8-30" },
    });
    fireEvent.change(screen.getByLabelText("Primary calendar"), {
      target: { value: "google" },
    });
    fireEvent.change(screen.getByLabelText("How did you hear about us?"), {
      target: { value: "Xero community" },
    });
    fireEvent.click(
      screen.getByLabelText("My organisation uses Xero Payroll Australia.")
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: confirmationPattern })
    );
    vi.mocked(fetch).mockResolvedValueOnce(acceptedResponse("sent"));
    submit();
    await expectReceipt();
    expect(bodyAt()).toEqual({
      calendarClient: "google",
      companySize: "8-30",
      country: "AU",
      email,
      heardFrom: "Xero community",
      message,
      name,
      organisation: "",
      sendConfirmation: true,
      type: "early-access",
      usesXeroPayroll: "yes",
    });
    expect(screen.getByRole("status").textContent).toContain(
      "Your application is with us"
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Your confirmation email has been sent"
    );
  });

  it("keeps the same idempotency key and body when retrying an uncertain delivery", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ContactPageContent />);
    fillShared();
    fillMessage();
    submit();
    await screen.findByRole("alert");
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("Your message").value
    ).toBe(message);
    submit();
    await expectReceipt();
    const [first, retry] = vi.mocked(fetch).mock.calls;
    expect(retry?.[1]?.headers).toEqual(first?.[1]?.headers);
    expect(retry?.[1]?.body).toBe(first?.[1]?.body);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("uses a new key when the visitor changes their failed message", async () => {
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000001")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000002");
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ContactPageContent />);
    fillShared();
    fillMessage();
    submit();
    await screen.findByRole("alert");
    fillMessage("Your message", "Here is my revised enquiry for the team.");
    submit();
    await expectReceipt();
    const [first, retry] = vi.mocked(fetch).mock.calls;
    expect(retry?.[1]?.headers).not.toEqual(first?.[1]?.headers);
  });

  it("shows accepted delivery and the reference when the requested confirmation fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(acceptedResponse("failed"));
    render(<ContactPageContent />);
    fillShared();
    fillMessage();
    fireEvent.click(
      screen.getByRole("checkbox", { name: confirmationPattern })
    );
    submit();
    await expectReceipt();
    expect(bodyAt().sendConfirmation).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "couldn’t send your confirmation email"
    );
    expect(screen.getByRole("status").textContent).toContain(
      "You do not need to submit again"
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps optional bug details within the bug report", async () => {
    render(<ContactPageContent />);
    fillShared();
    fireEvent.click(screen.getByRole("radio", { name: bugPattern }));
    fillMessage("What happened, and what did you expect?");
    fireEvent.change(screen.getByLabelText("Page URL (optional)"), {
      target: { value: "https://app.example.com/calendar" },
    });
    fireEvent.change(screen.getByLabelText("Steps to reproduce (optional)"), {
      target: { value: "Open the calendar." },
    });
    fireEvent.click(screen.getByRole("radio", { name: enquiryPattern }));
    fillMessage();
    submit();
    await expectReceipt();
    expect(bodyAt()).not.toHaveProperty("pageUrl");
    expect(bodyAt()).not.toHaveProperty("steps");
  });
});
