import Link from "next/link";
import { signUpHref } from "@/src/lib/auth-links";
import { SyncPathwayStrip } from "./sync-pathway-strip";

export const HeroSection = () => (
  <section className="fmkt-hero">
    <div className="fmkt-hero__copy">
      <div className="fmkt-hero__copy-inner">
        <div className="fmkt-pill fmkt-pill--neutral">Now in early access</div>
        <h1 className="fmkt-hero__title">
          Sync Xero with your calendar.
          <em>Manage leave, travel and out of office in one place.</em>
        </h1>
        <p className="fmkt-hero__body">
          Staff request leave or flag WFH. Approved leave writes back to Xero
          and appears in Outlook, Google Calendar or Apple Calendar. No chasing,
          re-keying or guessing who&rsquo;s in.
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
