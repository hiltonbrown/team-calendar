import Link from "next/link";
import { env } from "@/env";
import { MarketingIcon } from "./marketing-icons";
import { MarketingProductSnapshot } from "./marketing-product-snapshot";

const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";

export const Hero = () => (
  <>
    <section className="marketing-hero">
      <div className="marketing-hero__grid">
        <div className="marketing-hero__content">
          <div className="marketing-hero__text-card">
            <div className="marketing-pill">
              For Xero Payroll in AU, NZ & UK
            </div>
            <h1 className="marketing-hero__title">
              <span className="marketing-hero__title-wrap">
                <span className="marketing-hero__title-line">
                  Leave calendar management
                </span>
              </span>
              <span className="marketing-hero__title-wrap">
                <span className="marketing-hero__title-line">
                  which keeps everyone
                </span>
              </span>
              <span className="marketing-hero__title-wrap">
                <span className="marketing-hero__title-line marketing-hero__title-line--2">
                  <span className="marketing-hero__highlight">in sync.</span>
                </span>
              </span>
            </h1>
            <p className="marketing-hero__copy">
              Submit, approve and sync leave with Xero. Share availability in
              real time with secure calendar feeds.
            </p>
          </div>
          <div className="marketing-actions">
            <Link
              className="marketing-btn marketing-btn--primary"
              href={signUpHref}
            >
              Start trial
            </Link>
            <Link
              className="marketing-btn marketing-btn--outline marketing-btn--with-icon"
              href="/features"
            >
              See how it works
              <MarketingIcon id="play" size={14} />
            </Link>
          </div>

          <div className="marketing-hero-features">
            <div className="marketing-hero-feature">
              <div className="marketing-hero-feature__icon">
                <MarketingIcon id="sync" size={18} />
              </div>
              <span>
                Bidirectional sync
                <br />
                with Xero Payroll
              </span>
            </div>
            <div className="marketing-hero-feature">
              <div className="marketing-hero-feature__icon">
                <MarketingIcon id="calendar" size={18} />
              </div>
              <span>
                Real-time availability
                <br />
                and notifications
              </span>
            </div>
            <div className="marketing-hero-feature">
              <div className="marketing-hero-feature__icon">
                <MarketingIcon id="lock" size={18} />
              </div>
              <span>
                Secure calendar
                <br />
                feeds (ICS)
              </span>
            </div>
          </div>
        </div>
        <div className="marketing-hero__product">
          <MarketingProductSnapshot placement="hero" />
        </div>
      </div>
    </section>
  </>
);
