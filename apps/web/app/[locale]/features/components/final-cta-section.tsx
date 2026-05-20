import Link from "next/link";
import { env } from "@/env";

const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";

const CheckIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height={14}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2.5}
    viewBox="0 0 24 24"
    width={14}
  >
    <path d="M4 12l5 5L20 6" />
  </svg>
);

const LeafArt = ({ className }: { className: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1}
    viewBox="0 0 160 200"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M20 180 C40 140 90 100 155 30" />
    <path d="M40 180 C55 150 95 118 145 60" />
    <path d="M20 180 C60 165 110 140 155 30" />
    <path d="M65 180 C80 160 110 130 140 90" />
    <path d="M100 180 C108 165 122 148 135 120" />
    <path d="M30 140 C50 130 80 115 110 80" />
    <path d="M10 100 C30 88 60 72 100 45" />
  </svg>
);

const trustItems = ["No credit card required", "Setup in minutes"];

export const FinalCtaSection = () => (
  <section className="fmkt-cta">
    <div className="fmkt-container">
      <div className="fmkt-cta__panel">
        <LeafArt className="fmkt-cta__leaf fmkt-cta__leaf--left" />
        <LeafArt className="fmkt-cta__leaf fmkt-cta__leaf--right" />
        <div className="fmkt-cta__content">
          <h2 className="fmkt-cta__heading">
            Give your team an easier way to manage leave.
          </h2>
          <p className="fmkt-cta__copy">
            LeaveSync keeps requests simple for employees, approvals clear for
            managers, and Xero Payroll aligned behind the scenes.
          </p>
          <div className="fmkt-cta__actions">
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
          <div className="fmkt-cta__trust">
            {trustItems.map((item) => (
              <span className="fmkt-cta__trust-item" key={item}>
                <span aria-hidden="true" className="fmkt-cta__trust-icon">
                  <CheckIcon />
                </span>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
);
