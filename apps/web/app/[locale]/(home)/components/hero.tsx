import Link from "next/link";
import { env } from "@/env";
import { MarketingIcon } from "./marketing-icons";

const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";

const timelineItems = [
  {
    time: "Mon",
    title: "Amelia leave",
    detail: "Xero approved",
    icon: "plane",
    tone: "annual",
  },
  {
    time: "Tue",
    title: "Lachlan WFH",
    detail: "Team calendar",
    icon: "home",
    tone: "wfh",
  },
  {
    time: "Thu",
    title: "Hannah away",
    detail: "Shared",
    icon: "mapPin",
    tone: "travel",
  },
] as const;

export const Hero = () => (
  <section className="marketing-hero">
    <div className="marketing-hero__grid">
      <div className="marketing-hero__content">
        <div className="marketing-hero__text-card">
          <div className="marketing-pill">For Xero Payroll in AU, NZ & UK</div>
          <h1 className="marketing-hero__title">
            <span className="marketing-hero__title-wrap">
              <span className="marketing-hero__title-line">
                One team calendar.
              </span>
            </span>
            <span className="marketing-hero__title-wrap">
              <span className="marketing-hero__title-line marketing-hero__title-line--2">
                Synced with Xero.
              </span>
            </span>
          </h1>
          <p className="marketing-hero__copy">
            Show approved leave, work location and availability in one view,
            then keep Outlook, Google and Apple calendars up to date.
          </p>
        </div>
        <div className="marketing-actions">
          <Link
            className="marketing-btn marketing-btn--primary"
            href={signUpHref}
          >
            Start early access
          </Link>
          <Link
            className="marketing-btn marketing-btn--outline marketing-btn--with-icon"
            href="/features"
          >
            See how it works
            <MarketingIcon id="play" size={14} />
          </Link>
        </div>
      </div>
      <div className="marketing-hero__product">
        <div className="hero-phone">
          <div className="hero-phone__chrome">
            <span />
          </div>
          <div className="hero-phone__screen">
            <div className="hero-phone__header">
              <div>
                <span>This week</span>
                <strong>Team availability</strong>
              </div>
              <span className="hero-phone__sync">
                <MarketingIcon id="sync" size={14} />
                Synced
              </span>
            </div>
            <div className="hero-phone__summary">
              <span>8 people</span>
              <span>3 calendars</span>
            </div>
            <div className="hero-timeline">
              {timelineItems.map((item) => (
                <div className="hero-timeline__item" key={item.title}>
                  <span className="hero-timeline__time">{item.time}</span>
                  <div
                    className={`hero-timeline__event hero-timeline__event--${item.tone}`}
                  >
                    <span className="hero-timeline__icon">
                      <MarketingIcon id={item.icon} size={15} />
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);
