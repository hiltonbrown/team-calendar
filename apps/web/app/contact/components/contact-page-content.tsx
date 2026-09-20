"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Bug,
  Check,
  Clock3,
  Headphones,
  MessageCircle,
  MoveRight,
  Sprout,
} from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";
import { supportHoursLong } from "@/src/data/support";

const reasons = [
  {
    action: "Send enquiry",
    detail: "A question, an idea, a conversation.",
    heading: "What’s on your mind?",
    icon: MessageCircle,
    id: "enquiry",
    message: "Your message",
    title: "Make an enquiry",
  },
  {
    action: "Apply for early access",
    detail: "Bring Team Calendar to your business.",
    heading: "Let’s get to know your team.",
    icon: Sprout,
    id: "early-access",
    message: "How do you manage leave and availability today?",
    title: "Apply for early access",
  },
  {
    action: "Send support enquiry",
    detail: "A little help getting things working.",
    heading: "How can we help?",
    icon: Headphones,
    id: "support",
    message: "What do you need help with?",
    title: "Get support",
  },
  {
    action: "Send bug report",
    detail: "Tell us what isn’t working as expected.",
    heading: "Let’s get to the bottom of it.",
    icon: Bug,
    id: "bug",
    message: "What happened, and what did you expect?",
    title: "Report a bug",
  },
] as const;
type ContactType = (typeof reasons)[number]["id"];
const confirmationMessages = {
  failed:
    "Your message was received, but we couldn’t send your confirmation email. Please save this reference. You do not need to submit again.",
  "not-requested":
    "No confirmation email was requested. Save this reference for your records.",
  sent: "Your confirmation email has been sent. Check your junk folder if it doesn’t arrive.",
};
const responseSchema = z.object({
  confirmation: z.enum(["sent", "failed", "not-requested"]),
  reference: z.string(),
});

export const ContactPageContent = ({
  initialType = "enquiry",
}: {
  initialType?: ContactType;
}) => {
  const [type, setType] = useState<ContactType>(initialType);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(
    {}
  );
  const [shared, setShared] = useState({
    email: "",
    name: "",
    organisation: "",
  });
  const [sendConfirmation, setSendConfirmation] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<z.infer<typeof responseSchema> | null>(
    null
  );
  const request = useRef<{ body: string; key: string } | null>(null);
  const busy = useRef<boolean>(false);
  const reason = reasons.find((item) => item.id === type) ?? reasons[0];
  const draft = drafts[type] ?? {};
  const fieldValue = (name: string) => draft[name] ?? "";
  const update = (name: string, value: string) =>
    setDrafts((previous) => ({
      ...previous,
      [type]: { ...previous[type], [name]: value },
    }));
  const submit = async (form: HTMLFormElement) => {
    if (busy.current || !form.reportValidity()) {
      return;
    }
    busy.current = true;
    setStatus("sending");
    const body = JSON.stringify({
      ...Object.fromEntries(new FormData(form)),
      sendConfirmation,
      type,
    });
    if (request.current?.body !== body) {
      request.current = { body, key: crypto.randomUUID() };
    }
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/contact`,
        {
          body,
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": request.current.key,
          },
          method: "POST",
        }
      );
      const result: unknown = await response.json();
      const parsed = responseSchema.safeParse(result);
      if (!(response.ok && parsed.success)) {
        const failure = z.object({ error: z.string() }).safeParse(result);
        setError(
          failure.success
            ? failure.data.error
            : "We could not send your message. Please try again."
        );
        setStatus("error");
        return;
      }
      setReceipt(parsed.data);
      setStatus("success");
      setDrafts((previous) => ({ ...previous, [type]: {} }));
      request.current = null;
    } catch {
      setError(
        "We could not confirm your submission. Your message is still here. Please try again."
      );
      setStatus("error");
    } finally {
      busy.current = false;
    }
  };

  return (
    <main className="fmkt-page contact-studio" id="main-content" tabIndex={-1}>
      <div className="fmkt-container">
        <header className="contact-studio__hero">
          <h1>
            Good things start
            <br />
            with <span>a conversation.</span>
          </h1>
          <div className="contact-studio__welcome">
            <ArrowDownLeft aria-hidden="true" size={42} strokeWidth={1.3} />
            <p>
              Getting started or getting unstuck.
              <br />
              You’re in the right place.
            </p>
          </div>
        </header>
        <div className="contact-studio__workspace">
          <aside className="contact-studio__aside">
            <fieldset
              className="contact-studio__reasons"
              disabled={status === "sending"}
            >
              <legend>What brings you here?</legend>
              {reasons.map((item) => {
                const Icon = item.icon;
                return (
                  <label
                    className="contact-studio__reason"
                    data-selected={type === item.id}
                    key={item.id}
                  >
                    <input
                      checked={type === item.id}
                      name="contact-reason"
                      onChange={() => {
                        setType(item.id);
                        setStatus("idle");
                        setReceipt(null);
                      }}
                      type="radio"
                      value={item.id}
                    />
                    <Icon aria-hidden="true" size={23} strokeWidth={1.6} />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="contact-studio__reason-arrow"
                      size={21}
                    />
                  </label>
                );
              })}
            </fieldset>
            <div className="contact-studio__hours">
              <Clock3 aria-hidden="true" size={19} />
              <div>
                <strong>A real team, ready to help.</strong>
                <p>{supportHoursLong}</p>
                <p>Built on the Gold Coast, Australia.</p>
              </div>
            </div>
          </aside>
          <section
            aria-busy={status === "sending"}
            aria-labelledby="contact-panel-title"
            className="contact-studio__panel"
          >
            <div className="contact-studio__panel-heading">
              <h2 id="contact-panel-title">{reason.heading}</h2>
              <p>
                {type === "early-access"
                  ? "Apply for Australian early access. For organisations using Xero Payroll Australia. Applying does not grant immediate access."
                  : "Tell us a little about yourself and we’ll take it from there."}
              </p>
            </div>
            {status === "success" && receipt ? (
              <div className="contact-studio__receipt" role="status">
                <Check aria-hidden="true" size={40} />
                <h3>
                  {type === "early-access"
                    ? "Your application is with us."
                    : "Your message is with us."}
                </h3>
                <p>
                  We’ll respond to <strong>{shared.email}</strong> during our
                  response hours.
                </p>
                <p className="contact-studio__reference">
                  Reference: {receipt.reference}
                </p>
                <p>{confirmationMessages[receipt.confirmation]}</p>
                <button
                  className="marketing-btn marketing-btn--primary"
                  onClick={() => {
                    setStatus("idle");
                    setReceipt(null);
                  }}
                  type="button"
                >
                  Send another message{" "}
                  <MoveRight aria-hidden="true" size={18} />
                </button>
              </div>
            ) : (
              <form
                aria-label={reason.title}
                onSubmit={async (event) => {
                  event.preventDefault();
                  await submit(event.currentTarget);
                }}
              >
                <fieldset
                  className="contact-studio__fields"
                  disabled={status === "sending"}
                >
                  <div className="contact-studio__pair">
                    <label htmlFor="contact-name">
                      Your name
                      <input
                        autoComplete="name"
                        id="contact-name"
                        maxLength={100}
                        minLength={2}
                        name="name"
                        onChange={(event) =>
                          setShared({ ...shared, name: event.target.value })
                        }
                        required
                        value={shared.name}
                      />
                    </label>
                    <label htmlFor="contact-email">
                      Email address
                      <input
                        autoComplete="email"
                        id="contact-email"
                        maxLength={254}
                        name="email"
                        onChange={(event) =>
                          setShared({ ...shared, email: event.target.value })
                        }
                        required
                        type="email"
                        value={shared.email}
                      />
                    </label>
                  </div>
                  <label htmlFor="contact-organisation">
                    Organisation <span>(optional)</span>
                    <input
                      autoComplete="organization"
                      id="contact-organisation"
                      maxLength={200}
                      name="organisation"
                      onChange={(event) =>
                        setShared({
                          ...shared,
                          organisation: event.target.value,
                        })
                      }
                      value={shared.organisation}
                    />
                  </label>
                  <div className="contact-studio__adaptive" key={type}>
                    {type === "early-access" && (
                      <>
                        <input name="country" type="hidden" value="AU" />
                        <div className="contact-studio__pair">
                          <label htmlFor="company-size">
                            Team size
                            <select
                              id="company-size"
                              name="companySize"
                              onChange={(event) =>
                                update("companySize", event.target.value)
                              }
                              required
                              value={fieldValue("companySize")}
                            >
                              <option value="">Select team size</option>
                              <option value="1-7">1–7 people</option>
                              <option value="8-30">8–30 people</option>
                              <option value="31-75">31–75 people</option>
                              <option value="76+">76+ people</option>
                            </select>
                          </label>
                          <label htmlFor="calendar-client">
                            Primary calendar
                            <select
                              id="calendar-client"
                              name="calendarClient"
                              onChange={(event) =>
                                update("calendarClient", event.target.value)
                              }
                              required
                              value={fieldValue("calendarClient")}
                            >
                              <option value="">Select calendar</option>
                              <option value="microsoft">
                                Microsoft Outlook
                              </option>
                              <option value="google">Google Calendar</option>
                              <option value="apple">Apple Calendar</option>
                              <option value="other">Other</option>
                            </select>
                          </label>
                        </div>
                        <label htmlFor="heard-from">
                          How did you hear about us?
                          <input
                            id="heard-from"
                            maxLength={200}
                            minLength={2}
                            name="heardFrom"
                            onChange={(event) =>
                              update("heardFrom", event.target.value)
                            }
                            required
                            value={fieldValue("heardFrom")}
                          />
                        </label>
                        <label
                          className="contact-studio__check"
                          htmlFor="xero-payroll"
                        >
                          <input
                            checked={draft.usesXeroPayroll === "yes"}
                            id="xero-payroll"
                            name="usesXeroPayroll"
                            onChange={(event) =>
                              update(
                                "usesXeroPayroll",
                                event.target.checked ? "yes" : ""
                              )
                            }
                            required
                            type="checkbox"
                            value="yes"
                          />
                          <span>
                            My organisation uses Xero Payroll Australia.
                          </span>
                        </label>
                      </>
                    )}
                    {type === "bug" && (
                      <div className="contact-studio__pair">
                        <label htmlFor="page-url">
                          Page URL <span>(optional)</span>
                          <input
                            id="page-url"
                            maxLength={2000}
                            name="pageUrl"
                            onChange={(event) =>
                              update("pageUrl", event.target.value)
                            }
                            type="url"
                            value={fieldValue("pageUrl")}
                          />
                        </label>
                        <label htmlFor="browser">
                          Browser / device <span>(optional)</span>
                          <input
                            id="browser"
                            maxLength={200}
                            name="browser"
                            onChange={(event) =>
                              update("browser", event.target.value)
                            }
                            value={fieldValue("browser")}
                          />
                        </label>
                      </div>
                    )}
                    <label htmlFor="contact-message">
                      {reason.message}
                      <textarea
                        aria-describedby="contact-message-help"
                        id="contact-message"
                        maxLength={5000}
                        minLength={10}
                        name="message"
                        onChange={(event) =>
                          update("message", event.target.value)
                        }
                        required
                        rows={5}
                        value={fieldValue("message")}
                      />
                    </label>
                    {type === "bug" && (
                      <label htmlFor="bug-steps">
                        Steps to reproduce <span>(optional)</span>
                        <textarea
                          id="bug-steps"
                          maxLength={5000}
                          name="steps"
                          onChange={(event) =>
                            update("steps", event.target.value)
                          }
                          rows={3}
                          value={fieldValue("steps")}
                        />
                      </label>
                    )}
                  </div>
                  <p className="contact-studio__note" id="contact-message-help">
                    Please leave out passwords, private calendar feed links,
                    payroll records and employee personal information.
                  </p>
                  <label
                    className="contact-studio__check contact-studio__confirmation"
                    htmlFor="send-confirmation"
                  >
                    <input
                      checked={sendConfirmation}
                      id="send-confirmation"
                      onChange={(event) =>
                        setSendConfirmation(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>Email me a confirmation</strong>
                      <small>
                        A receipt with your reference, for your records.
                      </small>
                    </span>
                  </label>
                  {status === "error" && (
                    <p className="contact-studio__error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="contact-studio__submit">
                    <button
                      className="marketing-btn marketing-btn--primary"
                      disabled={status === "sending"}
                      type="submit"
                    >
                      {status === "sending" ? "Sending…" : reason.action}
                      <MoveRight aria-hidden="true" size={20} />
                    </button>
                    <p>
                      We use your details to respond.
                      <br />
                      <a href="/privacy">
                        Read our privacy policy{" "}
                        <ArrowUpRight aria-hidden="true" size={12} />
                      </a>
                    </p>
                  </div>
                  {type === "early-access" && (
                    <p className="contact-studio__note">
                      Rejected or inactive application correspondence is removed
                      after 90 days. Pricing is confirmed with your organisation
                      before any future paid billing.
                    </p>
                  )}
                </fieldset>
                <span className="sr-only" role="status">
                  {status === "sending"
                    ? "Sending your message. Please wait."
                    : ""}
                </span>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};
