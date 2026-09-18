import Link from "next/link";
import { signUpHref } from "@/src/lib/auth-links";

export const InteractiveHeroSection = () => (
  <section className="ft-hero">
    <h1 className="ft-hero__title">
      Every absence.
      <em>Every person on the calendar.</em>
    </h1>
    <p className="ft-hero__body">
      Bring Xero Payroll leave and off-payroll availability into one shared
      view, then publish it to Outlook, Google Calendar and Apple Calendar.
    </p>
    <Link className="marketing-btn marketing-btn--primary" href={signUpHref}>
      Sign up
    </Link>
  </section>
);
