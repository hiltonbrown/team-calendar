import Link from "next/link";
import { env } from "@/env";
import { MarketingFeedCopy } from "./marketing-feed-copy";
import { MarketingIcon } from "./marketing-icons";

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

        <div className="marketing-portrait-wrap">
          {/* Height controlled by min-height on portrait-wrap */}

          {/* Floating Cards - Reordered to match example */}
          <div className="marketing-floating-card marketing-floating-card--top">
            <div className="marketing-fc-header">
              <h4>Team availability</h4>
            </div>
            <div className="marketing-fc-calendar">
              <div className="marketing-fc-cal-header">
                <span />
                <span>Mon 12</span>
                <span>Tue 13</span>
                <span>Wed 14</span>
                <span>Thu 15</span>
                <span>Fri 16</span>
              </div>
              <div className="marketing-fc-cal-row">
                <span className="marketing-fc-name">Sarah</span>
                <div
                  className="marketing-fc-event marketing-fc-event--leave"
                  style={{ gridColumn: "2 / span 2" }}
                >
                  Annual leave
                </div>
                <div
                  className="marketing-fc-event marketing-fc-event--leave"
                  style={{ gridColumn: "6 / span 1" }}
                />
              </div>
              <div className="marketing-fc-cal-row">
                <span className="marketing-fc-name">James</span>
                <div
                  className="marketing-fc-event marketing-fc-event--wfh"
                  style={{ gridColumn: "4 / span 1" }}
                >
                  WFH
                </div>
              </div>
              <div className="marketing-fc-cal-row">
                <span className="marketing-fc-name">Mia</span>
                <div
                  className="marketing-fc-event marketing-fc-event--training"
                  style={{ gridColumn: "2 / span 2" }}
                >
                  Training
                </div>
                <div
                  className="marketing-fc-event marketing-fc-event--client"
                  style={{ gridColumn: "5 / span 1" }}
                >
                  Client site
                </div>
              </div>
              <div className="marketing-fc-cal-row">
                <span className="marketing-fc-name">Tom</span>
                <div
                  className="marketing-fc-event marketing-fc-event--plum"
                  style={{ gridColumn: "4 / span 2" }}
                >
                  Annual leave
                </div>
              </div>
            </div>
            <div className="marketing-fc-legend">
              <span>
                <span className="marketing-fc-dot marketing-fc-dot--leave" />{" "}
                Leave
              </span>
              <span>
                <span className="marketing-fc-dot marketing-fc-dot--wfh" /> WFH
              </span>
              <span>
                <span className="marketing-fc-dot marketing-fc-dot--other" />{" "}
                Other
              </span>
            </div>
          </div>

          <div className="marketing-floating-card marketing-floating-card--middle">
            <div className="marketing-fc-icon-wrapper">
              <div className="marketing-fc-icon marketing-fc-icon--green">
                <MarketingIcon id="checkCircle" size={20} />
              </div>
            </div>
            <div className="marketing-fc-content">
              <h4>Leave approved</h4>
              <p>
                Annual leave for 18–22 May has been approved and synced to Xero.
              </p>
              <div className="marketing-fc-footer">
                <span className="marketing-xero-badge">xero</span> Synced to
                Xero Payroll
              </div>
            </div>
          </div>

          <div className="marketing-floating-card marketing-floating-card--bottom">
            <h4>Calendar feed</h4>
            <div className="marketing-feed-url">
              <span>https://leavesync.com/ical/abc123.ics</span>
              <MarketingFeedCopy url="https://leavesync.com/ical/abc123.ics">
                <MarketingIcon id="copy" size={14} />
              </MarketingFeedCopy>
            </div>
            <div className="marketing-feed-icons">
              <div className="marketing-app-icon marketing-app-icon--outlook">
                <MarketingIcon id="outlook" size={16} />
              </div>
              <div className="marketing-app-icon marketing-app-icon--gcal">
                <MarketingIcon id="gcal" size={16} />
              </div>
              <div className="marketing-app-icon marketing-app-icon--applecal">
                <MarketingIcon id="applecal" size={16} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </>
);
