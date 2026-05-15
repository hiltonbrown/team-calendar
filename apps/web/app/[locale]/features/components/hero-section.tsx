import Image from "next/image";
import Link from "next/link";
import { env } from "@/env";

const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";

export const HeroSection = () => (
  <section className="fmkt-hero">
    <div className="fmkt-hero__copy">
      <div className="fmkt-pill">Features</div>
      <h1 className="fmkt-hero__title">
        Enter leave once.
        <em>Stay synchronised everywhere.</em>
      </h1>
      <p className="fmkt-hero__body">
        LeaveSync makes leave simple. Enter it once and we&rsquo;ll
        automatically sync to Outlook, Google Calendar and Xero, so your team,
        your calendars and your payroll are always in sync.
      </p>
      <div className="fmkt-hero__actions">
        <Link
          className="marketing-btn marketing-btn--primary"
          href={signUpHref}
        >
          Book a demo
        </Link>
        <Link
          className="marketing-btn marketing-btn--outline"
          href="#how-it-works"
        >
          See how it works
        </Link>
      </div>
    </div>
    <div aria-hidden="true" className="fmkt-hero__visual">
      <Image
        alt="A team of professionals discussing leave planning"
        className="fmkt-hero__photo"
        height={640}
        priority
        src="/marketing/team-photo.png"
        width={720}
      />
    </div>
  </section>
);
