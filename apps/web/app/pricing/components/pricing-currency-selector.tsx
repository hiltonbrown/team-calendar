"use client";

import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { supportMailtoHref } from "@/src/data/support";
import {
  getCurrencyPricingState,
  isPricingCurrency,
  type PricingCurrency,
  pricingCurrencies,
  pricingCurrencyOptions,
} from "../constants";

type PreviewPlan = "starter" | "premium";
type PremiumFeedFilter = "all" | "sydney" | "engineering";

export const PricingCurrencySelector = ({
  audPricing,
}: {
  audPricing: ReactNode;
}) => {
  const [currency, setCurrency] = useState<PricingCurrency>("AUD");
  const [activePlan, setActivePlan] = useState<PreviewPlan>("premium");
  const [activeFilter, setActiveFilter] = useState<PremiumFeedFilter>("all");
  const [copied, setCopied] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const state = getCurrencyPricingState(currency);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!stageRef.current) {
        return;
      }
      const rect = stageRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      stageRef.current.style.setProperty("--spotlight-x", `${x}px`);
      stageRef.current.style.setProperty("--spotlight-y", `${y}px`);
    },
    []
  );

  const handleCopyUrl = (url: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    }
  };

  const getFeedUrl = () => {
    if (activePlan === "starter") {
      return "webcal://teamcalendar.online/ical/core-company-feed_au09.ics";
    }
    switch (activeFilter) {
      case "sydney":
        return "webcal://teamcalendar.online/ical/sydney-office-feed_au92.ics";
      case "engineering":
        return "webcal://teamcalendar.online/ical/engineering-feed_au94.ics";
      default:
        return "webcal://teamcalendar.online/ical/all-teams-premium_au88.ics";
    }
  };

  const currentUrl = getFeedUrl();

  return (
    <div
      className="fmkt-pricing-stage-wrap"
      onPointerMove={handlePointerMove}
      ref={stageRef}
    >
      <div className="fmkt-pricing-region">
        <div className="fmkt-pricing-controls-bar">
          <div className="fmkt-pricing-currency-pill-wrap">
            <span className="fmkt-pricing-currency-label">
              Billing currency:
            </span>
            <div
              aria-label="Currency options"
              className="fmkt-pricing-currency-toggle"
              role="tablist"
            >
              {pricingCurrencyOptions.map((opt) => {
                const isSelected = currency === opt;
                return (
                  <button
                    aria-selected={isSelected}
                    className={[
                      "fmkt-pricing-currency-pill",
                      isSelected ? "fmkt-pricing-currency-pill--active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={opt}
                    onClick={() => setCurrency(opt)}
                    role="tab"
                    type="button"
                  >
                    <span className="fmkt-pricing-currency-code">{opt}</span>
                    <span className="fmkt-pricing-currency-country">
                      {pricingCurrencies[opt].country}
                    </span>
                  </button>
                );
              })}
            </div>
            <select
              aria-label="Currency and country"
              className="fmkt-pricing-sr-select"
              onChange={(e) => {
                const val = e.currentTarget.value;
                if (isPricingCurrency(val)) {
                  setCurrency(val);
                }
              }}
              value={currency}
            >
              {pricingCurrencyOptions.map((value) => (
                <option key={value} value={value}>
                  {pricingCurrencies[value].label} ·{" "}
                  {pricingCurrencies[value].country}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div aria-live="polite" className="fmkt-pricing-region__panel">
          <h2 className="fmkt-pricing-panel-heading">{state.heading}</h2>

          {state.available ? (
            <>
              <section
                aria-label="Interactive live calendar feed demonstration"
                className="fmkt-feed-simulator-section"
              >
                <div className="fmkt-feed-simulator-header">
                  <div className="fmkt-feed-simulator-intro">
                    <h3 className="fmkt-feed-simulator-title">
                      See how your feeds publish to Outlook, Google & Apple
                    </h3>
                    <p className="fmkt-feed-simulator-desc">
                      Approved leave in Xero and manual availability updates
                      standardise into subscribed feeds that update
                      automatically in your team’s calendars.
                    </p>
                  </div>
                  <div className="fmkt-feed-plan-tabs">
                    <button
                      className={[
                        "fmkt-feed-plan-tab",
                        activePlan === "starter"
                          ? "fmkt-feed-plan-tab--active"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setActivePlan("starter")}
                      type="button"
                    >
                      <span className="fmkt-feed-plan-tab__name">
                        Starter Feed
                      </span>
                      <span className="fmkt-feed-plan-tab__note">
                        1 Company-wide view
                      </span>
                    </button>
                    <button
                      className={[
                        "fmkt-feed-plan-tab",
                        activePlan === "premium"
                          ? "fmkt-feed-plan-tab--active"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setActivePlan("premium")}
                      type="button"
                    >
                      <span className="fmkt-feed-plan-tab__name">
                        Premium Feeds
                      </span>
                      <span className="fmkt-feed-plan-tab__note">
                        Team & location feeds
                      </span>
                    </button>
                  </div>
                </div>

                <div className="fmkt-sync-pipeline">
                  <div className="fmkt-sync-pipeline__node">
                    <div className="fmkt-sync-pipeline__icon fmkt-sync-pipeline__icon--xero">
                      <svg
                        aria-hidden="true"
                        fill="none"
                        height="18"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        width="18"
                      >
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    </div>
                    <div className="fmkt-sync-pipeline__text">
                      <strong>Xero Payroll AU</strong>
                      <span>Approved leave & balances</span>
                    </div>
                  </div>

                  <div
                    aria-hidden="true"
                    className="fmkt-sync-pipeline__connector"
                  >
                    <div className="fmkt-sync-pipeline__track" />
                    <div className="fmkt-sync-pipeline__pulse" />
                    <span className="fmkt-sync-pipeline__flow-label">
                      Synchronous write-back
                    </span>
                  </div>

                  <div className="fmkt-sync-pipeline__node fmkt-sync-pipeline__node--hub">
                    <div className="fmkt-sync-pipeline__icon fmkt-sync-pipeline__icon--hub">
                      <svg
                        aria-hidden="true"
                        fill="none"
                        height="20"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        width="20"
                      >
                        <rect
                          height="18"
                          rx="2"
                          ry="2"
                          width="18"
                          x="3"
                          y="4"
                        />
                        <line x1="16" x2="16" y1="2" y2="6" />
                        <line x1="8" x2="8" y1="2" y2="6" />
                        <line x1="3" x2="21" y1="10" y2="10" />
                      </svg>
                    </div>
                    <div className="fmkt-sync-pipeline__text">
                      <strong>Team Calendar Engine</strong>
                      <span>Canonical availability & privacy</span>
                    </div>
                  </div>

                  <div
                    aria-hidden="true"
                    className="fmkt-sync-pipeline__connector"
                  >
                    <div className="fmkt-sync-pipeline__track" />
                    <div className="fmkt-sync-pipeline__pulse fmkt-sync-pipeline__pulse--delay" />
                    <span className="fmkt-sync-pipeline__flow-label">
                      Secure ICS feeds
                    </span>
                  </div>

                  <div className="fmkt-sync-pipeline__node">
                    <div className="fmkt-sync-pipeline__icon fmkt-sync-pipeline__icon--cal">
                      <svg
                        aria-hidden="true"
                        fill="none"
                        height="18"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        width="18"
                      >
                        <rect
                          height="18"
                          rx="2"
                          ry="2"
                          width="18"
                          x="3"
                          y="4"
                        />
                        <line x1="16" x2="16" y1="2" y2="6" />
                        <line x1="8" x2="8" y1="2" y2="6" />
                        <line x1="3" x2="21" y1="10" y2="10" />
                        <path d="m9 16 2 2 4-4" />
                      </svg>
                    </div>
                    <div className="fmkt-sync-pipeline__text">
                      <strong>Outlook, Apple & Google</strong>
                      <span>Always up to date</span>
                    </div>
                  </div>
                </div>

                <div className="fmkt-feed-stage">
                  <div className="fmkt-feed-stage__chrome">
                    <div aria-hidden="true" className="fmkt-feed-stage__dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="fmkt-feed-stage__url-box">
                      <svg
                        aria-hidden="true"
                        fill="none"
                        height="14"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        width="14"
                      >
                        <rect
                          height="11"
                          rx="2"
                          ry="2"
                          width="18"
                          x="3"
                          y="11"
                        />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <code className="fmkt-feed-stage__url">{currentUrl}</code>
                    </div>
                    <button
                      className="fmkt-feed-stage__copy-btn"
                      onClick={() => handleCopyUrl(currentUrl)}
                      type="button"
                    >
                      {copied ? (
                        <>
                          <svg
                            aria-hidden="true"
                            fill="none"
                            height="14"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.5"
                            viewBox="0 0 24 24"
                            width="14"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <svg
                            aria-hidden="true"
                            fill="none"
                            height="14"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            width="14"
                          >
                            <rect
                              height="14"
                              rx="2"
                              ry="2"
                              width="14"
                              x="8"
                              y="8"
                            />
                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                          </svg>
                          <span>Copy feed URL</span>
                        </>
                      )}
                    </button>
                  </div>

                  {activePlan === "premium" ? (
                    <div className="fmkt-feed-stage__filters">
                      <span className="fmkt-feed-stage__filter-label">
                        Filtered sub-feeds:
                      </span>
                      <button
                        className={[
                          "fmkt-feed-filter-btn",
                          activeFilter === "all"
                            ? "fmkt-feed-filter-btn--active"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setActiveFilter("all")}
                        type="button"
                      >
                        All staff (50)
                      </button>
                      <button
                        className={[
                          "fmkt-feed-filter-btn",
                          activeFilter === "sydney"
                            ? "fmkt-feed-filter-btn--active"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setActiveFilter("sydney")}
                        type="button"
                      >
                        Sydney office
                      </button>
                      <button
                        className={[
                          "fmkt-feed-filter-btn",
                          activeFilter === "engineering"
                            ? "fmkt-feed-filter-btn--active"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setActiveFilter("engineering")}
                        type="button"
                      >
                        Engineering team
                      </button>
                    </div>
                  ) : (
                    <div className="fmkt-feed-stage__starter-notice">
                      <span>
                        Starter publishes one unified company feed covering up
                        to 9 staff.
                      </span>
                    </div>
                  )}

                  <div className="fmkt-feed-events-grid">
                    <div className="fmkt-feed-col">
                      <div className="fmkt-feed-col__day">Mon 21 Sep</div>
                      <div className="fmkt-feed-item fmkt-feed-item--xero">
                        <div className="fmkt-feed-item__header">
                          <span className="fmkt-feed-badge fmkt-feed-badge--sage">
                            Xero · Approved
                          </span>
                          <span className="fmkt-feed-time">All Day</span>
                        </div>
                        <strong className="fmkt-feed-item__title">
                          Emma Chen
                        </strong>
                        <span className="fmkt-feed-item__sub">
                          Annual Leave
                        </span>
                      </div>
                    </div>

                    <div className="fmkt-feed-col">
                      <div className="fmkt-feed-col__day">Tue 22 Sep</div>
                      <div className="fmkt-feed-item fmkt-feed-item--xero">
                        <div className="fmkt-feed-item__header">
                          <span className="fmkt-feed-badge fmkt-feed-badge--sage">
                            Xero · Approved
                          </span>
                          <span className="fmkt-feed-time">All Day</span>
                        </div>
                        <strong className="fmkt-feed-item__title">
                          David Miller
                        </strong>
                        <span className="fmkt-feed-item__sub">Sick Leave</span>
                      </div>
                    </div>

                    <div className="fmkt-feed-col">
                      <div className="fmkt-feed-col__day">Wed 23 Sep</div>
                      <div className="fmkt-feed-item fmkt-feed-item--manual">
                        <div className="fmkt-feed-item__header">
                          <span className="fmkt-feed-badge fmkt-feed-badge--lavender">
                            Manual Entry
                          </span>
                          <span className="fmkt-feed-time">All Day</span>
                        </div>
                        <strong className="fmkt-feed-item__title">
                          Alex Rivera
                        </strong>
                        <span className="fmkt-feed-item__sub">
                          Working from home
                        </span>
                      </div>
                    </div>

                    <div className="fmkt-feed-col">
                      <div className="fmkt-feed-col__day">Thu 24 Sep</div>
                      <div className="fmkt-feed-item fmkt-feed-item--manual">
                        <div className="fmkt-feed-item__header">
                          <span className="fmkt-feed-badge fmkt-feed-badge--lavender">
                            Manual Entry
                          </span>
                          <span className="fmkt-feed-time">All Day</span>
                        </div>
                        <strong className="fmkt-feed-item__title">
                          Sarah Jenkins
                        </strong>
                        <span className="fmkt-feed-item__sub">
                          Client site (Sydney CBD)
                        </span>
                      </div>
                    </div>

                    <div className="fmkt-feed-col">
                      <div className="fmkt-feed-col__day">Fri 25 Sep</div>
                      <div className="fmkt-feed-item fmkt-feed-item--holiday">
                        <div className="fmkt-feed-item__header">
                          <span className="fmkt-feed-badge fmkt-feed-badge--holiday">
                            Public Holiday
                          </span>
                          <span className="fmkt-feed-time">All Day</span>
                        </div>
                        <strong className="fmkt-feed-item__title">
                          Friday Holiday
                        </strong>
                        <span className="fmkt-feed-item__sub">
                          Australian Public Holiday
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="fmkt-feed-stage__footer">
                    <div className="fmkt-feed-stage__security-tag">
                      <svg
                        aria-hidden="true"
                        fill="none"
                        height="14"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        width="14"
                      >
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      <span>
                        Cryptographically signed tokens (revocable anytime)
                      </span>
                    </div>
                    <div className="fmkt-feed-stage__privacy-tag">
                      <svg
                        aria-hidden="true"
                        fill="none"
                        height="14"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        width="14"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span>
                        Privacy masking supported (Busy vs full details)
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {audPricing}
            </>
          ) : (
            <div className="fmkt-plan-fallback">
              <h3>{state.heading}</h3>
              <p>
                Contact us if you would like an update when{" "}
                {state.region.country} pricing becomes available.
              </p>
              <a
                className="marketing-btn marketing-btn--secondary"
                href={supportMailtoHref}
              >
                Contact support
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
