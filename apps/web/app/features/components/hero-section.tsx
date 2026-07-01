import Link from "next/link";
import { signUpHref } from "@/src/lib/auth-links";
import { SyncPathwayStrip } from "./sync-pathway-strip";

export const HeroSection = () => (
  <section className="fmkt-hero">
    <div className="fmkt-hero__copy">
      <div className="fmkt-hero__copy-inner">
        <div className="fmkt-pill">Now in early access</div>
        <h1 className="fmkt-hero__title">
          Out of office notifications, leave and working from home.
          <em>There is a better way to manage it all.</em>
        </h1>
        <p className="fmkt-hero__body">
          Team Calendar is for small businesses running Xero Payroll. Staff
          request leave and flag working from home in one place, approved leave
          writes back to Xero, and one accurate view publishes to
          everyone&rsquo;s Outlook, Google and Apple calendar. No chasing, no
          re-keying, no guessing who is in.
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
