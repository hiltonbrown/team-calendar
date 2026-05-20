import Link from "next/link";
import { env } from "@/env";
import { SyncPathwayStrip } from "./sync-pathway-strip";

const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";

export const HeroSection = () => (
  <section className="fmkt-hero">
    <div className="fmkt-hero__copy">
      <div className="fmkt-hero__copy-inner">
        <div className="fmkt-pill">Now in early access</div>
        <h1 className="fmkt-hero__title">
          Simple leave requests.
          <em>Clear calendars for everyone.</em>
        </h1>
        <p className="fmkt-hero__body">
          Employees request leave once in LeaveSync. Managers approve in
          context, Xero stays current, and Outlook, Google Calendar and Apple
          Calendar show who is available.
        </p>
        <div className="fmkt-hero__actions">
          <Link
            className="marketing-btn marketing-btn--primary"
            href={signUpHref}
          >
            Sign up
          </Link>
          <Link
            className="marketing-btn marketing-btn--outline"
            href="#how-it-works"
          >
            See how it works
          </Link>
        </div>
      </div>
    </div>
    <SyncPathwayStrip />
  </section>
);
